'use strict';

import Promise from 'bluebird'
import stampit from 'stampit'
import cuid from 'cuid'

//utility
function isFunction(obj) {
    return obj && toString.call(obj === '[object Function]')
}

/**
 * accepts `_id` as an initial id value. if an `id` function
 * exists (further up the composition chain) it does not override it;
 * otherwise, it provides its own method for `id()`
 * */
const identifiable = stampit()
    .init(function(){
        //accept id initializer value
        let id = this._id
        ;(delete this._id)
        if(!isFunction(this.id)) {
            this.id = function() {
                return (id || (id = cuid() ))
            }
            this.hasIdentity = () => {
                return (typeof(id) !== 'undefined')
            }
        }
    })

/**
 * encapsulates behaviors for revisioning of components
 * */
const revisable = stampit()
    .init(function() {
        let revision = 1
        /**
         * either get the current revision or set the revision with `val`
         * @param {Number} val the revision to set
         * */
        this.revision = function (val) {
            if(val) {
                return (revision = val)
            }
            return revision
        }
        /**
         * gets next revision (doesnt mutate state)
         * */
        this.nextRevision = () => {
            return (this.revision() + 1)
        }
    })

/**
 * simple hashmap storage of event providers
 * */
const hashIdentityMap = stampit().init(function(){
    let providers = new Map()
    this.register = (id, provider) => {
        if(!id) {
            throw new Error('`id` is required')
        }
        if(!provider) {
            throw new Error('`provider` is required')
        }
        providers.set(id, provider)
        return provider
    }
    this.get = (id) => {
        if(!id) {
            throw new Error('`id` is required')
        }
        let provider = providers.get(id)
        if(!provider) {
            throw new Error('could not locate provider with id "' + id + '""')
        }
        return provider
    }
    this.release = () => {
        providers.clear()
    }

})

const nullStorage = stampit()
    .init(function(){
        this.store = () => { }
        this.events = function*(from, to) {
            return []
        }
        this.clear = () => { }
    })
const inMemoryStorage = stampit()
    .compose(revisable)
    .init(function() {
        var envelopes = []
        this.store = (env) => {
            if(!env.revision) {
                env.revision = this.revision(this.nextRevision())
            }
            envelopes.push(env)
            return this
        }
        /**
         * clear all envelops. DANGER ZONE!
         * */
        this.clear = () => {
            envelopes = []
        }
        this.events = function*(from, to) {
            from = (from || 0)
            to = (to || Number.MAX_VALUE)
            if(from > to) {
                throw new Error('`from` must be less than or equal `to`')
            }
            if(!envelopes.length) {
                return []
            }
            for(let env of envelopes) {
                if(env.revision > to) {
                    //we are done streaming
                    return
                }
                if(env.revision >= from) {
                    for(let ev of env.events) {
                        yield ev
                    }
                }
            }
        }
    })

const writeableUnitOfWork = stampit()
    .refs({
        storage: undefined
        , identityMap: undefined
    })
    .methods({
        envelope: function enveloper( events) {
            return {
                events: events
            }
        }
    })
    .init(function(){
        let pending = []

        this.append = (e) => {
            pending.push.apply(pending,e)
            return e
        }
        this.commit = () => {
            //move reference to array in case event arrives while flushing
            let committable = pending.splice(0,pending.length)
            let envelope = this.envelope(committable)
            this.storage.store(envelope)
            return this
        }
        this.register = function() {
            //no op
        }
    })

const readableUnitOfWork = stampit()
    .refs({
        storage: undefined
        , identityMap: undefined
    })
    .init(function(){
        this.append = (e) => {
            //no op
            return e
        }
        this.commit = () => {
            return this
        }
        this.register = this.identityMap.register

        //helper function to allow function binding during iteration
        function asyncApply(event, identityMap) {
            let target = identityMap.get(event.id)
            return target.applyEvent(event)
        }
        const iterate = (cur, iterator, accumulator) => {
            if(cur.done) {
                return accumulator
            }
            let event = cur.value
            let result  = undefined
            if(accumulator.promise) {
                //chain promises
                //effectively creating a complicated reduce statement
                accumulator.promise = result = accumulator.promise
                    .then(asyncApply.bind(this, event, this.identityMap))
            } else {
                let target = this.identityMap.get(event.id)
                let fn = target.applyEvent.bind(target, event)
                try  {
                    result = fn()
                } catch(err) {
                    iterator.throw(err)
                    throw err
                }
                //was a promise returned?
                if(result && result.then) {
                    accumulator.promise = result
                }
            }
            return iterate(iterator.next(), iterator, accumulator)
        }
        this.restore = (root, from, to) => {
            if(!root) {
                throw new Error('`root` is required')
            }
            this.register(root.id(),root)
            let events = this.storage.events(from, to)
            let accumulator = {}
            iterate(events.next(),events,accumulator)
            if(accumulator.promise) {
                return accumulator.promise
            }
            return this
        }
    })

const unitOfWork = stampit()
    .refs({
        storage: undefined
        , identityMap: undefined
    })
    .methods({
        envelope: function enveloper( events) {
            return {
                events: events
            }
        }
    })
    .init(function(){
        let current
        let writeable = writeableUnitOfWork({
            envelope      : this.envelope
            , identityMap : this.identityMap
            , storage     : this.storage
        })
        let readable = readableUnitOfWork({
            identityMap : this.identityMap
            , storage   : this.storage
        })

        this.append = (e) => {
            let result = current.append(e)
            if(!this.atomic) {
                //each event gets stored
                this.commit()
                return result
            }
            return result
        }
        this.commit = () => {
            current.commit()
            this.identityMap.release()
            return this
        }
        this.register = (id, provider) => {
            return current.register(id, provider)
        }
        this.restore = (root, from, to) => {
            current = readable
            let result = current.restore(root, from, to)
            if(result.then) {
                return result
                .bind(this)
                .then(function(){
                    this.identityMap.release()
                    current = writeable
                    return this
                })
            } else {
                this.identityMap.release()
                current = writeable
                return this
            }
        }

        //by default we are in writeable state
        current = writeable
    })

const eventable = stampit()
    .init(function(){
        let uow = this.leo.unitOfWork()
        //decorate event(s) with critical properties
        let decorate = (arr) => {
            let rev = this.nextRevision()
            return arr.map((e) => {
                e.id = this.id()
                e.revision = rev++
                return e
            })
        }

        let assertIdentity = () => {
            if(!this.hasIdentity()) {
                throw new Error('identity is unknown')
            }
        }

        let validateEvents = function (arr) {
            for(let e of arr) {
                if(!e || !e.event) {
                    throw new Error('`event` is required')
                }
            }
            return arr
        }
        this.raise = function (e) {
            assertIdentity()
            if(!Array.isArray(e)) {
                e = [e]
            }
            validateEvents(e)
            decorate(e)
            uow.append(e)
            return this.applyEvent(e)
        }
        const applyEvent = (e, applied) => {
            if(applied.length === e.length) {
                return applied
            }
            let current = e[applied.length]
            this.revision(current.revision)
            applied.length = applied.length + 1

            let fn = this['$' + current.event]
            let result = undefined

            if(applied.promise) {
                if(!fn) {
                    return applyEvent(e, applied)
                }
                applied.promise = result = applied.promise
                    .return(current)
                    .bind(this)
                    .then(fn)
            } else {
                if(!fn) {
                    return applyEvent(e, applied)
                }
                result = fn.call(this, current)
                //received a promise
                if(result && result.then) {
                    applied.promise = result
                }
            }
            applied.results.push(result)
            return applyEvent(e, applied)
        }
        this.applyEvent = function(e) {
            if(!Array.isArray(e)) {
                e = [e]
            }
            let applied = {
                results: []
                , async: false
                , length: 0
            }
            applyEvent(e,applied)
            if(applied.promise) {
                return Promise.all(applied.results)
            }
            return this
        }
        //register this instance on the unit of work
        uow.register(this.id(), this)
    })

export default stampit()
    .static({
        /**
         * null object pattern for storage
         * when memory footprint is a concern or YAGNI storage
         * but want the benefits of event provider.
         * Handy for testing
         * */
        nullStorage: nullStorage
    })
    .compose(identifiable)
    .refs({
        /**
         * `false` immediately stores events; otherwise, they are
         * queued to be committed to storage later.
         * */
        atomic: true
    })
    .init(function() {
        this.storage = (this.storage || inMemoryStorage())
        this.identityMap = (this.identityMap || hashIdentityMap())
        //default uow impl
        let uow = unitOfWork({
            storage: this.storage
            , identityMap: this.identityMap
            , atomic: this.atomic
        })
        /**
         * Expose an `stamp` that may be use for composition
         * with another stamp
         * @method eventable
         * @return {stamp} factory that may be composed to attach
         * `eventable` behaviors onto another stamp
         * */
        this.eventable = () => {
            return stampit()
                .props({leo: this})
                .compose(identifiable)
                .compose(revisable)
                .compose(eventable)
        }

        /**
         * convenience method to commit pending events to storage
         * @return {leopold}
         * */
        this.commit = () => {
            return this.unitOfWork().commit()
        }
        /**
         * convenience method to unitOfWork inside `eventable` impl
         * @return {unitOfWork}
         * */
        this.unitOfWork = () => {
            return uow
        }
        /**
         * mount an envelope having events into storage
         * useful for testing, or perhaps seeding an app from a backend
         * */
        this.mount = (envelope) => {
            this.storage.store(envelope)
            return this
        }
        /**
         * restore to revision `to` from revision `from`
         * using `root` at the entrypoint. `to` and `from` are inclusive.
         * @param {eventable} root any `eventable` object
         * @param {Number} from lower bound revision to include
         * @param {Number} to upper bound revision to include
         * @return {Promise} resolving this leo instance
         */
        this.restore = (root, from, to) => {
            return this.unitOfWork().restore(root, from, to)
        }

        this.revision = () => {
            return this.storage.revision()
        }
    })

