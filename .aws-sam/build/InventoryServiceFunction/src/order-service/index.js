const { initTracer, withSpan } = require('../shared/tracer');
const { callService, createResponse } = require('../shared/utils');
const api = require('@opentelemetry/api');

// Initialize tracer for Order Service
const tracer = initTracer('order-service');

/**
 * Order Service Lambda Handler
 * This service accepts orders and orchestrates calls to Inventory and Payment services
 */
exports.handler = async (event) => {
  console.log('Order Service received event:', JSON.stringify(event));

  return withSpan('process-order', async (span) => {
    try {
      // Parse request body
      const body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
      const { orderId, customerId, items, paymentMethod } = body;

      // Validate input
      if (!orderId || !customerId || !items || !paymentMethod) {
        span.setStatus({ code: api.SpanStatusCode.ERROR, message: 'Invalid input' });
        span.setAttribute('error', true);
        span.setAttribute('error.message', 'Missing required fields');
        return createResponse(400, {
          success: false,
          error: 'Missing required fields: orderId, customerId, items, paymentMethod',
        });
      }

      // Add order details to span
      span.setAttribute('order.id', orderId);
      span.setAttribute('customer.id', customerId);
      span.setAttribute('order.items.count', items.length);
      span.setAttribute('payment.method', paymentMethod);

      console.log(`Processing order ${orderId} for customer ${customerId}`);

      // Step 1: Check inventory
      console.log('Step 1: Checking inventory');
      const inventoryUrl = process.env.INVENTORY_SERVICE_URL || 'http://localhost:3001/inventory';
      
      let inventoryResult;
      try {
        inventoryResult = await withSpan('check-inventory', async (inventorySpan) => {
          inventorySpan.setAttribute('service', 'inventory');
          inventorySpan.setAttribute('order.id', orderId);
          
          const result = await callService(inventoryUrl, {
            orderId,
            items,
          });
          
          inventorySpan.setAttribute('inventory.available', result.available);
          return result;
        });
      } catch (error) {
        span.setStatus({ code: api.SpanStatusCode.ERROR, message: 'Inventory check failed' });
        span.recordException(error);
        return createResponse(500, {
          success: false,
          orderId,
          error: 'Inventory check failed',
          details: error.message,
        });
      }

      if (!inventoryResult.available) {
        span.setAttribute('inventory.status', 'out-of-stock');
        span.setAttribute('inventory.unavailable_items', JSON.stringify(inventoryResult.unavailableItems || []));
        
        console.log(`Order ${orderId} failed: Items out of stock`);
        return createResponse(409, {
          success: false,
          orderId,
          error: 'Items out of stock',
          unavailableItems: inventoryResult.unavailableItems,
        });
      }

      span.setAttribute('inventory.status', 'available');

      // Step 2: Process payment
      console.log('Step 2: Processing payment');
      const paymentUrl = process.env.PAYMENT_SERVICE_URL || 'http://localhost:3002/payment';
      
      let paymentResult;
      try {
        paymentResult = await withSpan('process-payment', async (paymentSpan) => {
          paymentSpan.setAttribute('service', 'payment');
          paymentSpan.setAttribute('order.id', orderId);
          paymentSpan.setAttribute('payment.method', paymentMethod);
          
          const totalAmount = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
          paymentSpan.setAttribute('payment.amount', totalAmount);
          
          const result = await callService(paymentUrl, {
            orderId,
            customerId,
            amount: totalAmount,
            paymentMethod,
          });
          
          paymentSpan.setAttribute('payment.success', result.success);
          paymentSpan.setAttribute('payment.transaction_id', result.transactionId);
          
          return result;
        });
      } catch (error) {
        span.setStatus({ code: api.SpanStatusCode.ERROR, message: 'Payment processing failed' });
        span.recordException(error);
        return createResponse(500, {
          success: false,
          orderId,
          error: 'Payment processing failed',
          details: error.message,
        });
      }

      if (!paymentResult.success) {
        span.setAttribute('payment.status', 'failed');
        span.setAttribute('payment.failure_reason', paymentResult.reason || 'unknown');
        
        console.log(`Order ${orderId} failed: Payment failed`);
        return createResponse(402, {
          success: false,
          orderId,
          error: 'Payment failed',
          reason: paymentResult.reason,
        });
      }

      span.setAttribute('payment.status', 'success');
      span.setAttribute('payment.transaction_id', paymentResult.transactionId);

      // Order successful
      console.log(`Order ${orderId} completed successfully`);
      span.setStatus({ code: api.SpanStatusCode.OK });
      
      return createResponse(200, {
        success: true,
        orderId,
        message: 'Order processed successfully',
        transactionId: paymentResult.transactionId,
        totalAmount: items.reduce((sum, item) => sum + (item.price * item.quantity), 0),
      });

    } catch (error) {
      console.error('Order processing error:', error);
      span.setStatus({ code: api.SpanStatusCode.ERROR, message: error.message });
      span.recordException(error);
      
      return createResponse(500, {
        success: false,
        error: 'Internal server error',
        details: error.message,
      });
    }
  });
};
