'use strict';

import Promise from 'bluebird'
import stampit from 'stampit'
import cuid from 'cuid'

//utility
function isFunction(obj) {
    return obj && toString.call(obj === '[object Function]')
}

const trackable = stampit()
    .methods({
        register: function(id, provider) {
            return this.identityMap.register(id, provider)
        }
    })
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
            this.id = function(val) {
                if(id && val) {
                    throw new Error('`id` is already set as "' + id + '"' )
                }
                if(val) {
                    this.register(val, this)
                    return (id = val)
                }
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
                    return //we are done streaming
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
            let commitable = pending.splice(0,pending.length)
            return Promise.resolve(commitable)
                .bind(this)
                .then(this.envelope)
                .bind(this.storage)
                .tap(this.storage.store)
                .return(this)
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
            return Promise.resolve(this)
        }
        this.register = this.identityMap.register

        const iterate = (cur, iterator) => {
            if(cur.done) {
                return Promise.resolve(this)
            }
            let event = cur.value
            let target = this.identityMap.get(event.id)
            return target.applyEvent(event)
                .bind(this)
                .then(function(){
                    return iterate(iterator.next(), iterator)
                }, function(err) {
                    iterator.throw(err)
                    return err
                })
        }
        this.restore = (root, from, to) => {
            if(!root) {
                throw new Error('`root` is required')
            }
            this.register(root.id(),root)
            let events = this.storage.events(from, to)
            return iterate(events.next(),events)
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
            return current.append(e)
        }
        this.commit = () => {
            return current.commit()
                .bind(this.identityMap)
                .tap(this.identityMap.release)
                .return(this)
        }
        this.register = (id, provider) => {
            return current.register(id, provider)
        }
        this.restore = (root, from, to) => {
            current = readable
            return current.restore(root, from, to)
                .bind(this)
                .then(function(){
                    this.identityMap.release()
                    current = writeable
                    return this
                })
        }

        //by default we are in writeable state
        current = writeable
    })

const eventable = stampit()
    .init(function(){
        let uow = this.leo.unitOfWork()
        //decorate event(s) with critical properties
        let decorate = (arr) => {
            return arr.map((e) => {
                e.id = this.id()
                e.revision = this.nextRevision()
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

            return Promise.resolve(e)
            .bind(uow)
            .tap(uow.append)
            .bind(this)
            .then(this.applyEvent)
        }
        this.applyEvent = function(e) {
            this.revision(e.revision)
            if(Array.isArray(e)) {
                return Promise.resolve(e)
                    .bind(this)
                    .map(this.applyEvent)
                    .return(this)
            }
            return Promise.resolve(this)
                .bind(this)
                .tap(function(){
                    let fn = this['$' + e.event]
                    if(!fn) {
                        return this
                    }
                    return fn.call(this, e)
                })
                .return(this)

        }
        if(this.hasIdentity()) {
            //register this instance on the unit of work
            this.register(this.id(), this)
        }
    })

export default stampit()
    .compose(identifiable)
    .init(function() {
        this.storage = (this.storage || inMemoryStorage())
        this.identityMap = (this.identityMap || hashIdentityMap())
        //default uow impl
        let uow = unitOfWork({
            storage: this.storage
            , identityMap: this.identityMap
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
                .compose(trackable({ identityMap: this.identityMap}))
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
            return Promise.resolve(envelope)
                .bind(this.storage)
                .then(this.storage.store)
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
    })

