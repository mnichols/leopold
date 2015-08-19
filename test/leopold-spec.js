'use strict';

import leo from '..'
import test from 'blue-tape'

test('event provider events are stored', (assert) => {
    let events = []
    let storage = {
        append: events.push.apply(events)
    }
    let sut = leo({
        storage: storage
    })

    let model = sut.evented({$foo: ()=>{}})
    return model.raise({event: 'foo'})
        .bind(sut)
        .then(sut.flush)
        .then(()=>{
            assert.equal(events.length, 1)

        })
})


