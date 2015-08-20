'use strict';

import leo from '..'
import test from 'blue-tape'
import stampit from 'stampit'

test('event provider events are stored', (assert) => {
    let envelopes = []
    let storage = {
        append: function(env) {
            envelopes.push(env)

        }
        //append: envelopes.push.apply(envelopes)
    }
    let sut = leo({
        storage: storage
    })
    let dumb = {
        $foo: function(){}
    }
    let model = sut.evented(dumb)
    return model.raise({event: 'foo'})
        .bind(sut)
        .then(sut.commit)
        .then(()=>{
            assert.equal(envelopes.length, 1)

        })
})
test('restoring event providers works', (assert) => {
    let envelopes = []
    let storage = {
        append: function(env) {
            console.log('appending',env)
            envelopes.push(env)
        }
    }
    let sut = leo({storage: storage})

    let parentModel = stampit()
        .methods({
            $childAdded :function(e) {
                let child = sut.evented(childModel)({ _id: e.childId})
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
        { id: 1, event: 'childAdded', revision: 1, childId: 2}
        , { id: 2, event: 'named', revision: 1, name: 'joshua'}
        , { id: 1, event: 'childAdded', revision: 2, childId: 3}
        , { id: 3, event: 'named', revision: 1, name: 'chay'}
    ]

    let parent = sut.evented(parentModel)({ _id: 1})
    return parent.addChild('joshua')
        .then(parent.addChild.bind(parent,'chay'))
        .bind(sut)
        .then(sut.commit)
})


