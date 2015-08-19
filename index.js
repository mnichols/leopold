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
            if(Array.isArray(e)) {
                pending.push.apply(pending,e)
            } else {
                pending.push(e)
            }
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

const evented = stampit()
    .init(function(){
        let id
        let revision
        //no id function provided
        if(typeof(this.id) === 'undefined') {
            this.id = () => {
                return (id || (id = cuid() ))
            }
        }
        if(typeof(this.revision) === 'undefined') {
            this.revision = () => {
                return (revision || (revision = 1))
            }
        }
        this.raise = (e) => {
            if(!e.event) {
                throw new Error('`event` is required')
            }
            (revision = this.revision() + 1)

            return Promise.resolve(e)
            .bind(this.uow)
            .tap(this.uow.append)
            .bind(this)
            .then(this.applyEvent)
        }
        this.applyEvent = (e) => {
            return Promise.resolve(this)
                .bind(this)
                .call('$' + e.event, e)
                .return(this)

        }
    })

const leopold = (opts) => {
    opts = (opts || {})
    const storage = (opts.storage || inMemoryStorage())
    const identityMap = hashIdentityMap()
    const uow = (opts.unitOfWork || unitOfWork({
        storage: storage
        , identityMap: identityMap
    }))
    return stampit()
    .refs({
        uow: uow
    })
    .methods({
        commit: function() {
            return this.uow.commit()
        }
        ,evented: function (it = {}) {
            let result =  evented.create(it)
            result.uow = uow
            return result
        }
    })
    .create()
}
export default leopold
