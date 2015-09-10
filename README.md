# leopold

```
 __^___
[(0¿0)]
   ~-
```

## Event-sourced models for nodejs or browser

[![GitHub stars](https://img.shields.io/github/stars/mnichols/leopold.svg)](https://github.com/mnichols/leopold/stargazers)
[![Build Status](https://travis-ci.org/mnichols/leopold.svg?branch=master)](https://travis-ci.org/mnichols/leopold)

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
            return account()
                .initialize(e.accountId, e.accountName)
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
            let acctId = cuid()
            return this.raise({
                event: 'accountApproved'
                , accountName: accountName
                , accountId: acctId
            })
            .bind(this)
            .then(function(){
                return this.accounts[acctId].initialize()
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

// instance.accounts[{cuid}].balance === 300.42

```

### Dependencies

`leopold` uses [stampit](https://github.com/stampit-org/stampit) under the hood
and the `eventable` call presumes you are composing event source behavior
into an prototype ('spec').

`leopold` is also using some ES6 features that require [babel](http://babeljs.io/).


### Running tests

`make test` (nodejs)
`make browser` (browser) then visit on any browser at `http://localhost:2222`
