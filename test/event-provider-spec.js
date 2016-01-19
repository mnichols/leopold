import test from 'blue-tape'
import leo from '../src/leopold'
import stampit from 'stampit'
import Promise from 'bluebird'

const fireable = () => {
    var spec = {
    }
    return stampit()
        .methods({
            fire (args) {
                return this.raise({
                    event: 'fired'
                    , name: args.name
                })
            }
            , $fired (e) {
                this.name = e.name
            }
        })
}


const pushable = () => {
    var spec = {
    }
    return stampit()
        .methods({
            push (args) {
                return this.pushEvent({
                    event: 'pushed'
                    , name: args.name
                })
            }
            , $pushed (e) {
                this.name = e.name
            }
        })
}
test('extending id-less object', ( assert ) => {
    assert.plan(1)
    let sut = leo()
    let model = sut.eventable().create()
    assert.ok(model.id())
})
test.skip('lazy identification is write-once', (assert) => {
    assert.plan(1)
    let sut = leo()
    let model = sut.eventable().create()
    model.id('boing')
    assert.equal(model.id(),'boing')
    assert.throws(model.id.bind(model,'bing'))

})
test('extending function id`d object', ( assert ) => {
    assert.plan(1)
    let sut = leo()
    let model = sut.eventable().create({id: ()=>{ return "foo"}})
    assert.equal(model.id(),"foo")
})
test('extending parameter id`d object', ( assert ) => {
    assert.plan(1)
    let sut = leo()
    let model = sut.eventable().create({_id : 'foo'})
    assert.equal(model.id(),"foo")
})
test('raising event without `event` throws',  ( assert ) => {
    assert.plan(1)
    let sut = leo()
    const model = stampit()
        .compose(sut.eventable())
        .create()

    assert.throws(model.raise.bind(model,{event: undefined}),/`event` is required/)
})
test('raising event without handler is ok',(assert) => {
    assert.plan(2)
    let sut = leo()
    const model = stampit()
        .compose(sut.eventable())
        .create()
    model.raise({ event: 'foo'})
    let es = Array.from(sut.storage.events())
    assert.equal(es.length,0)
    assert.pass('no handler is ok')
})
test('raising event mutates provider',  ( assert ) => {
    assert.plan(1)
    let sut = leo()
    const model = fireable()
        .compose(sut.eventable())
        .create()

    model.fire({ name: 'bleh'})
    assert.equal(model.name,'bleh')
})
test('raising events array predictably mutates provider', ( assert )=> {
    assert.plan(1)
    let sut = leo()
    let model = stampit()
        .methods({
            $fired: function(e) {
                return Promise.resolve()
                    .bind(this)
                    .then(function(){
                        this.val = e.val
                    })
            }
            , $nexted: function(e) {
                this.next = this.val
            }
            , fire: function() {
                let events = [
                    {event: 'fired', val: 1}
                    , {event: 'nexted'}
                ]
                return this.raise(events)
            }
        })
        .compose(sut.eventable())
        .create()
    model.fire()
    .then(function(){
        assert.equal(model.next,1)
    })

})
test('raising event increments revision',  ( assert ) => {
    assert.plan(2)
    let sut = leo()
    const model = fireable()
        .compose(sut.eventable())
        .create()

    assert.equal(model.revision(),1)

    model.fire({ name: 'bleh'})
    assert.equal(model.revision(),2)
})
test('pushing event increments revision and is on storage but does not mutate provider first time',  ( assert ) => {
    assert.plan(3)
    let sut = leo()
    const model = pushable()
        .compose(sut.eventable())
        .create()

    assert.equal(model.revision(),1)

    model.push({ name: 'bleh'})
    assert.equal(model.revision(),2)
    assert.notOk(model.name)
})


