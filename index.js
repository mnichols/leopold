'use strict';

import Promise from 'bluebird'
import stampit from 'stampit'
import cuid from 'cuid'

const hashIdentityMap = stampit().init(function(){
    let providers = {}
    this.register = (id, provider) => {
        if(!id) {
            throw new Error('`id` is required')
        }
        if(!provider) {
            throw new Error('`provider` is required')
        }
        providers[id] = provider
        return provider
    }
    this.release = () => {
        providers = {}
    }

})

const inMemoryStorage = stampit()
    .methods({
        append: function(env) {
            env.revision = this.revision()
            this.envelopes.push(env)
            return this
        }
    })
    .init(function() {
        let revision = 0
        this.envelopes = []
        this.revision = () => {
            return (revision++)
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
                .tap(this.storage.append)
                .bind(this.identityMap)
                .tap(this.identityMap.release)
                .return(this)
        }
        this.register = this.identityMap.register
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

        this.append = (e) => {
            return current.append(e)
        }
        this.commit = () => {
            return current.commit()
        }
        this.register = (id, provider) => {
            return current.register(id, provider)
        }
        //by default we are in writeable state
        current = writeable
    })

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
        }
    })

const revisable = stampit()
    .init(function() {
        let revision = 1
        this.revision = function (val) {
            if(typeof(val) !== 'undefined') {
                return (revision = val)
            }
            return revision
        }
    })
const eventable = stampit()
    .init(function(){
        let uow = this.leo.unitOfWork()
        //decorate event(s) with critical properties
        let decorate = (arr) => {
            return arr.map((e) => {
                e.id = this.id()
                e.revision = this.revision()
                return e
            })
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
            .tap(() =>{
                this.revision(this.revision() + 1)
            })
        }
        this.applyEvent = function(e) {
            if(Array.isArray(e)) {
                return Promise.resolve(e)
                    .bind(this)
                    .map(this.applyEvent)
                    .return(this)
            }
            return Promise.resolve(this)
                .bind(this)
                .call('$' + e.event, e)
                .return(this)

        }
        //register this instance on the unit of work
        uow.register(this.id(), this)
    })

export default stampit()
    .refs({
        storage: inMemoryStorage()
        , identityMap: hashIdentityMap()
    })
    .compose(identifiable)
    .init(function() {
        //default uow impl
        let uow = unitOfWork({
            storage: this.storage
            , identityMap: this.identityMap
        })
        /**
         * Expose an `stamp` that may be use for composition
         * with another stamp
         * @method eventable
         * */
        this.eventable = () => {
            return stampit()
                .props({leo: this})
                .compose(identifiable)
                .compose(revisable)
                .compose(eventable)
        }
        this.commit = () => {
            return uow.commit()
        }
        this.unitOfWork = () => {
            return uow
        }
    })

