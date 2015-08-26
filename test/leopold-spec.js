'use strict';

import leo from '..'
import test from 'blue-tape'
import stampit from 'stampit'

test('event provider events are stored', (assert) => {
    assert.plan(1)
    let envelopes = []
    let storage = {
        store: function(env) {
            envelopes.push(env)

        }
        //append: envelopes.push.apply(envelopes)
    }
    let sut = leo({
        storage: storage
    })
    let model = stampit({
        methods: {
            $foo(){}
        }
    })
    .compose(sut.eventable())
    .create()
    model.raise({event: 'foo'})
    sut.commit()
    assert.equal(envelopes.length, 1)
})
test('restoring throwing event handler bubble up error',(assert) => {
    assert.plan(1)
    let sut = leo()
    let throwing = stampit().methods({
        $foo: function() {
            throw new Error('i have fooed')
        }
    })
    .compose(sut.eventable())
    .create({_id:1})

    let env = {
        revision: 1
        , events: [ { event: 'foo', id: 1, revision: 1 }]
    }
    sut.mount(env)
    assert.throws(sut.restore.bind(sut, throwing, 0, 1),/i have fooed/)
})
test('restoring event providers works', (assert) => {
    assert.plan(5)
    let envelopes = []
    let storage = {
        append: function(env) {
            envelopes.push(env)
        }
    }
    let sut = leo()

    let parentModel = stampit()
        .methods({
            $childAdded :function(e) {
                let child = childModel
                    .compose(this.leo.eventable())
                    .create({_id: e.childId})
                this.children[e.childId] = child
            }
            , addChild : function(name) {
                let kid = this.nextId()
                return this.raise({
                    event: 'childAdded'
                    , childId: kid
                })
                .then(this.nameChild.bind(this,kid,name))
            }
            , nameChild : function( id, name) {
                this.children[id].name(name)
            }
        })
        .init(function(){
            let kid = 2
            this.children = {}
            this.nextId = function(){
                return kid++
            }
        })
    let childModel = stampit()
        .methods({
            $named : function(e) {
                this._name = e.name
            }
            , name : function(name) {
                this.raise({ event: 'named', name: name })
            }

        })

    let events = [
        { id: 1, event: 'childAdded', revision: 2, childId: 2}
        , { id: 2, event: 'named', revision: 2, name: 'joshua'}
        , { id: 1, event: 'childAdded', revision: 3, childId: 3}
        , { id: 3, event: 'named', revision: 2, name: 'chay'}
    ]

    let parent = parentModel
        .compose(sut.eventable())
        .create({ _id: 1})

    sut.mount({revision: 1, events: events})
    sut.restore(parent, 0, 1)
    assert.ok(parent.children[2])
    assert.ok(parent.children[3])
    assert.equal(parent.revision(),3)
    assert.equal(parent.children[2]._name,'joshua')
    assert.equal(parent.children[3]._name,'chay')
})


