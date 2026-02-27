const { withSpan, addSpanAttributes } = require('../shared/tracer');
const { callService, createResponse } = require('../shared/utils');

/**
 * Order Service Lambda Handler
 * This service accepts orders and orchestrates calls to Inventory and Payment services
 * OpenTelemetry instrumentation is automatically provided by the Lambda Layer
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
        addSpanAttributes({
          'error': true,
          'error.message': 'Missing required fields',
        });
        return createResponse(400, {
          success: false,
          error: 'Missing required fields: orderId, customerId, items, paymentMethod',
        });
      }

      // Add order details to span
      addSpanAttributes({
        'order.id': orderId,
        'customer.id': customerId,
        'order.items.count': items.length,
        'payment.method': paymentMethod,
      });

      console.log(`Processing order ${orderId} for customer ${customerId}`);

      // Step 1: Check inventory
      console.log('Step 1: Checking inventory');
      const inventoryUrl = process.env.INVENTORY_SERVICE_URL || 'http://localhost:3001/inventory';
      
      let inventoryResult;
      try {
        inventoryResult = await withSpan('check-inventory', async (inventorySpan) => {
          addSpanAttributes({
            'service': 'inventory',
            'order.id': orderId,
          });
          
          const result = await callService(inventoryUrl, {
            orderId,
            items,
          });
          
          addSpanAttributes({
            'inventory.available': result.available,
          });
          
          return result;
        });
      } catch (error) {
        addSpanAttributes({
          'error': true,
          'error.message': 'Inventory check failed',
        });
        return createResponse(500, {
          success: false,
          orderId,
          error: 'Inventory check failed',
          details: error.message,
        });
      }

      if (!inventoryResult.available) {
        addSpanAttributes({
          'inventory.status': 'out-of-stock',
          'inventory.unavailable_items': JSON.stringify(inventoryResult.unavailableItems || []),
        });
        
        console.log(`Order ${orderId} failed: Items out of stock`);
        return createResponse(409, {
          success: false,
          orderId,
          error: 'Items out of stock',
          unavailableItems: inventoryResult.unavailableItems,
        });
      }

      addSpanAttributes({ 'inventory.status': 'available' });

      // Step 2: Process payment
      console.log('Step 2: Processing payment');
      const paymentUrl = process.env.PAYMENT_SERVICE_URL || 'http://localhost:3002/payment';
      
      let paymentResult;
      try {
        paymentResult = await withSpan('process-payment', async (paymentSpan) => {
          const totalAmount = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
          
          addSpanAttributes({
            'service': 'payment',
            'order.id': orderId,
            'payment.method': paymentMethod,
            'payment.amount': totalAmount,
          });
          
          const result = await callService(paymentUrl, {
            orderId,
            customerId,
            amount: totalAmount,
            paymentMethod,
          });
          
          addSpanAttributes({
            'payment.success': result.success,
            'payment.transaction_id': result.transactionId || 'none',
          });
          
          return result;
        });
      } catch (error) {
        addSpanAttributes({
          'error': true,
          'error.message': 'Payment processing failed',
        });
        return createResponse(500, {
          success: false,
          orderId,
          error: 'Payment processing failed',
          details: error.message,
        });
      }

      if (!paymentResult.success) {
        addSpanAttributes({
          'payment.status': 'failed',
          'payment.failure_reason': paymentResult.reason || 'unknown',
        });
        
        console.log(`Order ${orderId} failed: Payment failed`);
        return createResponse(402, {
          success: false,
          orderId,
          error: 'Payment failed',
          reason: paymentResult.reason,
        });
      }

      addSpanAttributes({
        'payment.status': 'success',
        'payment.transaction_id': paymentResult.transactionId,
      });

      // Order successful
      console.log(`Order ${orderId} completed successfully`);
      
      return createResponse(200, {
        success: true,
        orderId,
        message: 'Order processed successfully',
        transactionId: paymentResult.transactionId,
        totalAmount: items.reduce((sum, item) => sum + (item.price * item.quantity), 0),
      });

    } catch (error) {
      console.error('Order processing error:', error);
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
