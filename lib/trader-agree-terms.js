/* global getCurrentParticipant getAssetRegistry getParticipantRegistry query getFactory getFactory emit */


/**
 * Get namespace
 * @returns {string}
 */
function getNamespace() {
    return 'org.finance.payment';
}

/**
 * Get namespace for composer type
 * @param {string} type - hyperledger composer model type
 * @returns {string} namespace
 */
function getNamespaceForType(type) {
    return `${getNamespace()}.${type}`;
}

/**
 * Move buyer funds to escrow account
 * @param {org.finance.payment.AgreeTerms} agreement - the agreement to be processed
 * @returns {Promise<void>}
 */
async function moveFundsToEscrowAccount(agreement) {
    const accountRegistry = await getAssetRegistry(getNamespaceForType('EscrowAccount'));
    const traderRegistry = await getParticipantRegistry(getNamespaceForType('Trader'));
    const tradeRegistry = await getAssetRegistry(getNamespaceForType('Trade'));

    // check if the buyer still has enough funds
    if (agreement.trade.buyer.balance < agreement.trade.total) {
        throw new Error('the buyer does not have enough funds');
    }

    // create escrow account for the buyer if not available yet
    const accounts =  await query('selectEscrowAccountsForTrader', { trader: `resource:org.finance.payment.Trader#${agreement.trade.buyer.$identifier}`});
    let account;
    if (accounts.length === 0) {
        // create new escrow account for the buyer
        account = getFactory().newResource(getNamespace(), 'EscrowAccount', Math.round((agreement.timestamp).getTime() / 1000).toString());
        account.trader = agreement.trade.buyer;
        account.balance += agreement.trade.total;
        await accountRegistry.add(account);
    } else {
        account = accounts[0];
        account.balance += agreement.trade.total;
        await accountRegistry.update(account);
    }

    agreement.trade.buyer.balance -= agreement.trade.total;
    agreement.trade.escrowAccount = getFactory().newRelationship(getNamespace(), 'EscrowAccount', account);
    agreement.trade.status = 'STEP_3_BUYER_MOVED_FUNDS_TO_ESCROW';

    await traderRegistry.update(agreement.trade.buyer);
    await tradeRegistry.update(agreement.trade);
}

/**
 * Emit event
 * @param {string} type - type
 * @param {org.finance.payment.Trade} trade - trade
 * @param {org.finance.payment.Trader} trader -trader
 */
function emitEvent(type, trade, trader) {
    const factory = getFactory();
    let event = factory.newEvent('org.finance.payment', type);
    event.trade = trade;
    if (trader) {
        event.trader =  trader;
    }
    emit(event);
}

/**
 * Agree to terms
 * @param {org.finance.payment.AgreeTerms} agreement - the agreement to be processed
 * @transaction
 */
async function agreeTerms(agreement) { // eslint-disable-line no-unused-vars
    const tradeRegistry = await getAssetRegistry(getNamespaceForType('Trade'));
    const currentParticipant = getCurrentParticipant();

    if (agreement.trade.seller.id !== currentParticipant.id && agreement.trade.buyer.id !== currentParticipant.id) {
        throw new Error('the trader is not part of this trade');
    }

    if (agreement.isAccepted) {
        if (agreement.trade.buyer.id === currentParticipant.id) {
            agreement.trade.hasBuyerAcceptedTerms = true;
            emitEvent('BuyerAgreedToTermsEvent', agreement.trade, agreement.trade.buyer);
        }
        if (agreement.trade.seller.id === currentParticipant.id) {
            agreement.trade.hasSellerAcceptedTerms = true;
            emitEvent('SellerAgreedToTermsEvent', agreement.trade, agreement.trade.seller);
        }

        if (agreement.trade.hasBuyerAcceptedTerms && agreement.trade.hasSellerAcceptedTerms) {
            agreement.trade.status = 'STEP_2_TERMS_ACCEPTED';
            emitEvent('BothPartiesAgreedToTermsEvent', agreement.trade);
        }
        await tradeRegistry.update(agreement.trade);

        // Auto pay
        if (agreement.trade.hasBuyerAcceptedTerms && agreement.trade.hasSellerAcceptedTerms && agreement.trade.isAutoPay) {
            await moveFundsToEscrowAccount(agreement);
            emitEvent('BuyerPaidEscrowEvent', agreement.trade);
        }
    } else {
        agreement.trade.status = 'STEP_2_TERMS_NOT_ACCEPTED';
        agreement.trade.cancelledBy = await getCurrentParticipant();
        await tradeRegistry.update(agreement.trade);
        emitEvent('TraderDidNotAgreeTermsEvent', agreement.trade, currentParticipant);
    }
}