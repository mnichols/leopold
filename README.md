# leopold

```
 __^___
[(0¿0)]
   ~-
```

## Event-sourced models for nodejs or browser

### Install

`npm install --save leopold`

### Quick Start

#### Eventable models

```js

import leopold from 'leopold'
import stampit from 'stampit'

// create a leo that includes a unit of work and factory for event providers
const leo = leopold()

const accountSpec = stampit()
    .methods({
        // by convention, event handlers are named '$' + '${event.name}'
        // async handlers are supported
        $initialized: function(e) {
            this.id(e.id)
            this.name = e.name
            this.balance = e.balance
        }
        , $deposited: function(e) {
            this.balance = e.balance
        }
        , initialize: function(name) {
            //returns a promise
            return this.raise({
                event: 'initialized'
                , id: 'checking'
                , balance: 0
                , name: name
            })
        }
        , deposit: function(amount) {
            return this.raise({
                event: 'deposited'
                , balance: (this.balance + amount)
            })
        }
    })
    .compose(leo.eventable())

const customerSpec = stampit()
    .methods({
        $initialized:  function(e) {
            this.id(e.id)
            this.name = e.name
            this.accounts = {}
        }
        , $accountApproved: function(e) {
            //use special _id attribute to initialize new account
            return account({ _id: e.accountName})
                .initialize(e.accountName)
                .bind(this)
                .then(function(newAccount) {
                    this.accounts[e.accountName] = newAccount
                })
        }
        , initialize: function(name) {
            return this.raise({
                event: 'initialized'
                , name: name
            })
        }
        , approveAccount: function(accountName) {
            return this.raise({
                event: 'accountApproved'
                , accountName: accountName
            })
            .bind(this)
            .then(function(){
                return this.accounts[accountName].initialize()
            })
        }
        , makeDeposit: function(account, amount) {
            return this.accounts[account].deposit(amount)
        }
    })


//use 
let customer = customerSpec.create()
customer.approveAccount('checking') // -> customer.accounts['checking']
customer.makeDeposit('checking',300.42) // -> account.balance === 300.42

```

Notice we have a object graph that is two deep. 

#### Now let's consume a set of events to restore state to where this was

```js

let instance =  customerSpec.create({_id: 1})
let events = [
    { event: 'initialized', id: 1, name: 'mike' }
    , { event: 'accountApproved', id: 1, name: 'checking' }
    , { event: 'initialized', id: 'checking', name: 'checking', balance: 0 }
    , { event: 'deposited', id: 'checking', balance: 300.42}
]
let envelope = {
    revision: 1
    , events: events
}

// events are stored as envelopes
return leo.mount(envelope)
    .then(function(){
        return leo.restore(instance, 0 , Number.MAX_VALUE)
    })

// instance.accounts['checking'].balance === 300.42

```

//more docs on the way...
