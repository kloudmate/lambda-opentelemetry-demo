const { withSpan, addSpanAttributes } = require('../shared/tracer');
const { createResponse } = require('../shared/utils');

// Mock payment processing
const FAILURE_PATTERNS = {
  'card-declined': ['4111111111111111', 'card-declined'],
  'insufficient-funds': ['4222222222222222', 'insufficient-funds'],
  'expired-card': ['4333333333333333', 'expired-card'],
};

/**
 * Simulate payment processing with some failure scenarios
 * @param {string} paymentMethod - Payment method identifier
 * @param {number} amount - Payment amount
 * @returns {Object} Payment result
 */
function processPayment(paymentMethod, amount) {
  // Check for known failure patterns
  for (const [reason, patterns] of Object.entries(FAILURE_PATTERNS)) {
    if (patterns.some(pattern => paymentMethod.includes(pattern))) {
      return {
        success: false,
        reason: reason.replace('-', ' '),
        transactionId: null,
      };
    }
  }

  // Simulate random failures (10% chance)
  if (Math.random() < 0.1) {
    const reasons = ['network-timeout', 'gateway-error', 'rate-limit-exceeded'];
    const randomReason = reasons[Math.floor(Math.random() * reasons.length)];
    return {
      success: false,
      reason: randomReason.replace('-', ' '),
      transactionId: null,
    };
  }

  // Successful payment
  return {
    success: true,
    transactionId: `txn-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
  };
}

/**
 * Payment Service Lambda Handler
 * This service processes payments with failure scenarios for testing
 * OpenTelemetry instrumentation is automatically provided by the Lambda Layer
 */
exports.handler = async (event) => {
  console.log('Payment Service received event:', JSON.stringify(event));

  return withSpan('process-payment', async (span) => {
    try {
      // Parse request body
      const body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
      const { orderId, customerId, amount, paymentMethod } = body;

      // Validate input
      if (!orderId || !customerId || !amount || !paymentMethod) {
        addSpanAttributes({
          'error': true,
          'error.message': 'Missing required fields',
        });
        return createResponse(400, {
          success: false,
          error: 'Missing required fields: orderId, customerId, amount, paymentMethod',
        });
      }

      addSpanAttributes({
        'order.id': orderId,
        'customer.id': customerId,
        'payment.amount': amount,
        'payment.method': paymentMethod,
      });

      console.log(`Processing payment for order ${orderId}, amount: ${amount}`);

      // Validate amount
      if (amount <= 0) {
        addSpanAttributes({
          'error': true,
          'error.message': 'Invalid payment amount',
        });
        return createResponse(400, {
          success: false,
          error: 'Invalid payment amount',
        });
      }

      // Process payment
      const paymentResult = processPayment(paymentMethod, amount);

      addSpanAttributes({
        'payment.success': paymentResult.success,
      });

      if (!paymentResult.success) {
        addSpanAttributes({
          'payment.failure_reason': paymentResult.reason,
        });
        
        console.log(`Payment failed for order ${orderId}: ${paymentResult.reason}`);
        
        return createResponse(200, {
          success: false,
          orderId,
          reason: paymentResult.reason,
          message: 'Payment processing failed',
        });
      }

      addSpanAttributes({
        'payment.transaction_id': paymentResult.transactionId,
      });

      console.log(`Payment successful for order ${orderId}. Transaction ID: ${paymentResult.transactionId}`);

      return createResponse(200, {
        success: true,
        orderId,
        transactionId: paymentResult.transactionId,
        amount,
        message: 'Payment processed successfully',
      });

    } catch (error) {
      console.error('Payment processing error:', error);
      addSpanAttributes({
        'error': true,
        'error.message': error.message,
      });
      
      return createResponse(500, {
        success: false,
        error: 'Internal server error',
        details: error.message,
      });
    }
  });
};
