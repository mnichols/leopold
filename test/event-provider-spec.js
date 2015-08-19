import test from 'blue-tape'
import leo from '..'
import Promise from 'bluebird'

function createModel() {
    var spec = {
        fire: function(args) {
            return this.raise({
                event: 'fired'
                , name: args.name
            })
        }
        , $fired: function(e) {
            this.name = e.name
        }
    }
    return leo().evented(spec)
}
test('extending id-less object', assert => {
    assert.plan(1)
    let model = leo().evented({})
    assert.ok(model.id())
})
test('extending id`d object', assert => {
    assert.plan(1)
    let model = leo().evented({id: ()=>{ return "foo"}})
    assert.equal(model.id(),"foo")
})
test('raising event without `event` throws',  assert => {
    const model = createModel()
    assert.plan(1)
    assert.throws(model.raise.bind(model,{event: undefined}),/`event` is required/)
})
test('raising event mutates provider',  assert => {
    const model = createModel()
    return model.fire({ name: 'bleh'})
        .tap( its => {
            assert.equal(its.name,'bleh')
        })
})
test('raising event increments revision',  assert => {
    const model = createModel()
    return model.fire({ name: 'bleh'})
        .tap( its => {
            assert.equal(its.revision(),2)
        })
})
