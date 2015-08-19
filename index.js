'use strict';

import Promise from 'bluebird'
import stampit from 'stampit'
import cuid from 'cuid'

const mixin = (behavior) => target => Object.assign(target, behavior)

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
        let flushing = false

        this.append = (e) => {
            if(flushing) {
                //in proc flush so put on next tick
                return flushing
                    .bind(this)
                    .then(function() {
                        return this.append(e)
                    })
            }
            if(Array.isArray(e)) {
                pending.append.apply(pending,e)
            } else {
                pending.append(e)
            }
        }
        this.flush = () => {
            return flushing = Promise.resolve(pending.splice(0,pending.length))
                .bind(this)
                .then(this.envelope)
                .bind(this.storage)
                .then(this.storage.append)
                .return(this)
        }
    })

const evented = stampit()
    .init(function(){
        let id
        //no id function provided
        if(typeof(this.id) === 'undefined') {
            this.id = () => {
                return (id || (id = cuid() ))
            }
        }
        this.raise = (e) => {
            if(!e.event) {
                throw new Error('`event` is required')
            }
            //store...then
            return this.applyEvent(e)
        }
        this.applyEvent = (e) => {
            return Promise.resolve(this)
                .bind(this)
                .call('$' + e.event, e)
                .return(this)

        }
    })

const leopold = (opts) => {
    const storage = (opts.storage || storage)
    const identityMap = identityMap()
    const uow = unitOfWork()
    return stampit().static({
        evented(it = {}) {
            return evented.create(it)
        }
    })
}
export default leopold
