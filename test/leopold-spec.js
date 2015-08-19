'use strict';

import leo from '..'
import test from 'blue-tape'

test('event provider events are stored', (assert) => {
    let envelopes = []
    let storage = {
        append: function(env) {
            console.log('envelope',env)
            envelopes.push(env)

        }
        //append: envelopes.push.apply(envelopes)
    }
    let sut = leo({
        storage: storage
    })

    let model = sut.evented({$foo: ()=>{}})
    return model.raise({event: 'foo'})
        .bind(sut)
        .then(sut.commit)
        .then(()=>{
            assert.equal(envelopes.length, 1)

        })
})


