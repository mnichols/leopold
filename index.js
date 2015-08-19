'use strict';

import Promise from 'bluebird'
import stampit from 'stampit'
import cuid from 'cuid'

const hashIdentityMap = stampit().init()

const inMemoryStorage = stampit()
    .methods({
        append: function(env) {
            this.envelopes.push(env)
            return this
        }
    })
    .init(function() {
        this.envelopes = []
    })

const unitOfWork = stampit()
    .refs({
        storage: undefined
        , identityMap: undefined
    })
    .methods({
        envelope: function( events) {
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
                .return(this)
        }
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

        let validateEvents = (arr) => {
            for(let e of arr) {
                if(!e || !e.event) {
                    throw new Error('`event` is required')
                }
            }
            return arr
        }
        if(!isFunction(this.id)) {
            this.id = () => {
                return (id || (id = cuid() ))
            }
        }
        //no id function provided
        if(typeof(this.revision) === 'undefined') {
            this.revision = () => {
                return (revision || (revision = 1))
            }
        }
        this.raise = (e) => {
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
        this.applyEvent = (e) => {
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
        , evented: function(it) {
            if(stampit.isStamp(it)) {
                return it
                    .compose(stampit().refs({ uow: this.uow}))
                    .compose(eventable)
            }
            let ev = eventable({ uow: this.uow})
            Object.assign(it, ev)
            return it
        }
    })
    .init(function() {
        this.uow = unitOfWork({
            storage: this.storage
            , identityMap: this.identityMap
        })
    })

