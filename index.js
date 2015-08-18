'use strict';

import Promise from 'bluebird'
import stampit from 'stampit'
import cuid from 'cuid'

const mixin = (behavior) => target => Object.assign(target, behavior)

const evented = stampit()
    .init(function(instance){
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
    return stampit().static({
        evented(it = {}) {
            return evented.create(it)
        }
    })
}
export default leopold
