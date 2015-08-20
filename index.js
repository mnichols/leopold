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
const eventable = stampit()
    .init(function(){
        //accept id initializer value
        let id = this._id
        ;(delete this._id)
        let revision

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
        if(!isFunction(this.id)) {
            this.id = function() {
                return (id || (id = cuid() ))
            }
        }
        //no id function provided
        if(typeof(this.revision) === 'undefined') {
            this.revision = function () {
                return (revision || (revision = 1))
            }
        }
        this.raise = function (e) {
            if(!Array.isArray(e)) {
                e = [e]
            }
            validateEvents(e)
            decorate(e)

            return Promise.resolve(e)
            .bind(this.uow)
            .tap(this.uow.append)
            .bind(this)
            .then(this.applyEvent)
            .tap(() =>{
                revision = this.revision() + 1
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
        this.uow.register(this.id(), this)
    })

export default stampit()
    .refs({
        storage: inMemoryStorage()
        , identityMap: hashIdentityMap()
    })
    .methods({
        commit: function() {
            return this.uow.commit()
        }
        , composable: function() {
            return stampit()
                .refs({ uow: this.uow})
                .compose(eventable)
        }
        /**
         * Expose an `stamp` that may be use for composition
         * with another stamp
         * @method evented
         * */
        , evented: function(it) {
            if(stampit.isStamp(it)) {
                return it
                    .compose(stampit().refs({ uow: this.uow}))
                    .compose(eventable)
            }
            let stamp = stampit()
                .refs({ uow: this.uow})
                .compose(eventable)
            Object.assign(it, stamp())
            return it
        }
    })
    .init(function() {
        this.uow = unitOfWork({
            storage: this.storage
            , identityMap: this.identityMap
        })
    })

