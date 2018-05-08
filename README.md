# hyperledger-composer-escrow-payment
Simple Hyperledger Composer Escrow style payment smart contract implementation for study purposes

For learning purposes and getting familiar with Hyperledger Composer smart contracts, I decided to implement a very simple smart contract for an escrow style payment based on the escrow defintion. As the smart contract replaces the need for an escrow account, the responsiblity belongs to the smart contract.  I do create the escrow account inside the blockchain to makes this easy to follow when looking at the definition of escrow. To easily expand upon it I also added a few extra steps and made sure the code is almost completely unit tested.

## How does escrow work?
source escrow.com

Escrow.com reduces the risk of fraud by acting as a trusted third-party that collects, holds and only disburses funds when both Buyers and Sellers are satisfied.

* Buyer and Seller agree to terms - Either the Buyer or Seller begins a transaction. After registering at Escrow.com, all parties agree to the terms of the transaction.
* Buyer pays Escrow.com - The Buyer submits a payment by approved payment method to our secure Escrow Account, Escrow.com verifies the payment, the Seller is notified that funds have been secured 'In Escrow'.
* Seller ships merchandise to Buyer - Upon payment verification, the Seller is authorised to send the merchandise and submit tracking information. Escrow.com verifies that the Buyer receives the merchandise.
*Buyer accepts merchandise - The Buyer has a set number of days to inspect the merchandise and the option to accept or reject it. The Buyer accepts the merchandise
* Escrow.com pays the Seller - Escrow.com releases funds to the Seller from the Escrow Account.

## Hyperledger Composer smart contract

I added the same flow but in form of smart contract.

A few steps I added:

* normal direct payment where the escrow account is not used and the buyers balance is immediately creditted
* auto pay setting: when set to true the buyer automatically transfers the funds to the escrow account
* cancel a trade: either buyer or seller can cancel the trade if the merchandise has not shipped yet

### Benefits of Hyperledger Composer smart contract

* very easy data modelling system
* unit testing the smart contract is very straight forward
* much easier to deploy compared to normal Hyperledger Fabric chaincode deployment and development.

## Todo
* I have not implemented ACL rules or unit tests for it.　If done a lot of the transaction code will move to ACL when it comes to the checks.   However all is in place to easily test ACL rules.  As a next step I will create a more ACL focussed version.
* need to add cucumber tests
