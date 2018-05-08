/* global getCurrentParticipant getAssetRegistry query getParticipantRegistry getFactory emit */


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
 * Cancel trade
 * @param {org.finance.payment.CancelTrade} cancellation - the cancellation to be processed
 * @transaction
 */
async function cancelTrade(cancellation) { // eslint-disable-line no-unused-vars
    const currentTrader = getCurrentParticipant();
    const accountRegistry = await getAssetRegistry(getNamespaceForType('EscrowAccount'));
    const traderRegistry = await getParticipantRegistry(getNamespaceForType('Trader'));
    const tradeRegistry = await getAssetRegistry(getNamespaceForType('Trade'));

    // check if the trader is part of the trade
    if (cancellation.trade.buyer.id !== currentTrader.id && cancellation.trade.seller.id !== currentTrader.id) {
        throw new Error('the trader is not part of the trade');
    }

    // check if the trade has a status that can still be cancelled or not
    const allowedStates = [
        'STEP_1_WAITING_FOR_TERMS_AGREEMENT',
        'STEP_2_TERMS_ACCEPTED',
        'STEP_3_BUYER_MOVED_FUNDS_TO_ESCROW'
    ];
    if (allowedStates.indexOf(cancellation.trade.status) === -1) {
        throw new Error(`the trade cannot be cancelled in ${cancellation.trade.status} state`);
    }


    // move escrow funds back to buyer if necessary
    if (cancellation.trade.status === 'STEP_3_BUYER_MOVED_FUNDS_TO_ESCROW') {
        // get buyer escrow account
        const accounts =  await query('selectEscrowAccountsForTrader', { trader: `resource:org.finance.payment.Trader#${cancellation.trade.buyer.id}`});
        if (accounts.length === 0) {
            throw new Error('The buyers escrow account is not found');
        }
        accounts[0].balance -= cancellation.trade.total;
        cancellation.trade.buyer.balance += cancellation.trade.total;
        await traderRegistry.update(cancellation.trade.buyer);
        await accountRegistry.update(accounts[0]);
    }

    // update trade
    if (cancellation.trade.buyer.id === currentTrader.id) {
        cancellation.trade.status = 'STEP_0_CANCELLED_BY_BUYER';
    }
    if (cancellation.trade.seller.id === currentTrader.id) {
        cancellation.trade.status = 'STEP_0_CANCELLED_BY_SELLER';
    }

    await tradeRegistry.update(cancellation.trade);

    // emit event
    const factory = getFactory();
    let event = factory.newEvent('org.finance.payment', 'TraderCancelledTradeEvent');
    event.trade = cancellation.trade;
    event.trader = currentTrader;
    emit(event);
}