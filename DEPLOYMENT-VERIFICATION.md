# Deployment Verification Guide

This guide helps you verify that the Lambda OpenTelemetry Demo is working correctly.

## Pre-Deployment Checklist

- [ ] Node.js 20.x or later installed
- [ ] AWS CLI configured with valid credentials
- [ ] AWS SAM CLI installed
- [ ] Docker installed (for local testing)
- [ ] OpenTelemetry backend ready (Jaeger/Zipkin/etc.)

## Quick Deployment Steps

### 1. Start OpenTelemetry Backend

```bash
# Start Jaeger with Docker Compose
docker-compose up -d jaeger

# Verify Jaeger is running
curl http://localhost:16686
```

### 2. Update Layer ARN

Edit `template.yaml` and update the `AdotLayerArn` parameter for your region:

```yaml
AdotLayerArn:
  Default: 'arn:aws:lambda:YOUR-REGION:901920570463:layer:aws-otel-nodejs-amd64-ver-1-18-1:5'
```

Find ARNs for your region: https://aws-otel.github.io/docs/getting-started/lambda/lambda-js

### 3. Build and Deploy

```bash
# Install dependencies
npm install

# Build Lambda functions
sam build

# Deploy to AWS
sam deploy --guided
```

During deployment, provide:
- **Stack name**: `lambda-otel-demo`
- **AWS Region**: Your preferred region (e.g., `us-east-1`)
- **OtelCollectorEndpoint**: Your collector URL (e.g., `http://your-collector:4318`)
- **Environment**: `production` or `development`
- **AdotLayerArn**: ARN for your region
- Confirm changes: `y`

### 4. Note Deployment Outputs

Save these outputs from the deployment:
- `ApiEndpoint` - Base API Gateway URL
- `OrderServiceUrl` - Order service endpoint
- `InventoryServiceUrl` - Inventory service endpoint
- `PaymentServiceUrl` - Payment service endpoint

## Verification Tests

### Test 1: Successful Order ✅

```bash
curl -X POST https://YOUR-API-ENDPOINT/Prod/order \
  -H "Content-Type: application/json" \
  -d '{
    "orderId": "ORD-001",
    "customerId": "CUST-123",
    "paymentMethod": "credit-card-5555",
    "items": [
      {
        "itemId": "item-001",
        "name": "Laptop",
        "quantity": 1,
        "price": 999.99
      }
    ]
  }'
```

**Expected Response**: HTTP 200 with `"success": true`

### Test 2: Out of Stock ⚠️

```bash
curl -X POST https://YOUR-API-ENDPOINT/Prod/order \
  -H "Content-Type: application/json" \
  -d '{
    "orderId": "ORD-002",
    "customerId": "CUST-456",
    "paymentMethod": "credit-card-5555",
    "items": [
      {
        "itemId": "item-003",
        "name": "Keyboard",
        "quantity": 1,
        "price": 79.99
      }
    ]
  }'
```

**Expected Response**: HTTP 409 with `"error": "Items out of stock"`

### Test 3: Payment Failure 💳

```bash
curl -X POST https://YOUR-API-ENDPOINT/Prod/order \
  -H "Content-Type: application/json" \
  -d '{
    "orderId": "ORD-003",
    "customerId": "CUST-789",
    "paymentMethod": "4111111111111111",
    "items": [
      {
        "itemId": "item-001",
        "name": "Laptop",
        "quantity": 1,
        "price": 999.99
      }
    ]
  }'
```

**Expected Response**: HTTP 402 with `"error": "Payment failed"`

### Test 4: Automated Test Script

```bash
# Run all tests at once
./test-api.sh https://YOUR-API-ENDPOINT/Prod
```

## Trace Verification

### 1. Access Jaeger UI

Open http://localhost:16686 in your browser

### 2. Search for Traces

- **Service**: Select `order-service`
- **Operation**: Select `process-order`
- Click **Find Traces**

### 3. Verify Trace Structure

A successful order trace should show:

```
order-service: process-order (root span)
├── order-service: check-inventory
│   └── HTTP POST
│       └── inventory-service: check-inventory
└── order-service: process-payment
    └── HTTP POST
        └── payment-service: process-payment
```

### 4. Verify Span Attributes

Click on a span and verify these attributes are present:

**Order Service Span:**
- `order.id`
- `customer.id`
- `order.items.count`
- `payment.method`

**Inventory Service Span:**
- `inventory.all_available`
- `inventory.items.count`

**Payment Service Span:**
- `payment.success`
- `payment.amount`
- `payment.transaction_id`

## Common Issues and Solutions

### Issue: No traces appearing

**Solutions:**
1. Check CloudWatch Logs for Lambda errors:
   ```bash
   aws logs tail /aws/lambda/order-service --follow
   ```

2. Verify ADOT Layer is attached:
   ```bash
   aws lambda get-function --function-name order-service \
     --query 'Configuration.Layers'
   ```

3. Verify environment variables:
   ```bash
   aws lambda get-function-configuration --function-name order-service \
     --query 'Environment.Variables'
   ```

4. Test collector connectivity (if using VPC):
   - Ensure Lambda functions have VPC access
   - Check security groups allow outbound traffic to collector
   - Verify collector is listening on correct port

### Issue: Trace context not propagating

**Solutions:**
1. Verify `OTEL_PROPAGATORS=tracecontext` is set
2. Check API Gateway is passing headers through
3. Verify axios version is compatible (should be 1.13.5)

### Issue: High cold start times

**Solutions:**
1. Use provisioned concurrency for latency-sensitive functions
2. Increase Lambda memory (reduces cold start time)
3. Consider Lambda SnapStart if available in your region

### Issue: Service URLs incorrect

**Solutions:**
1. Verify API Gateway is deployed correctly
2. Check environment variables `INVENTORY_SERVICE_URL` and `PAYMENT_SERVICE_URL`
3. Ensure API Gateway stage is `Prod`

## Performance Benchmarks

Expected performance metrics:

| Metric | Value |
|--------|-------|
| Cold Start | 800-1200ms |
| Warm Invocation | 50-150ms |
| Trace Export Overhead | <5ms |
| E2E Order Processing | 200-500ms |

## Cleanup

To remove all resources:

```bash
# Delete the CloudFormation stack
sam delete --stack-name lambda-otel-demo

# Stop Jaeger
docker-compose down

# Clean build artifacts
rm -rf .aws-sam node_modules
```

## Next Steps

1. **Configure Sampling**: Update `OTEL_TRACES_SAMPLER` for production
2. **Add Alerting**: Set up CloudWatch alarms for Lambda errors
3. **Monitor Costs**: Track Lambda invocations and data transfer
4. **Customize Inventory**: Modify mock inventory in `src/inventory-service/index.js`
5. **Add More Scenarios**: Create additional test cases for your use case

## Support

For issues or questions:
- Review [README.md](./README.md) for detailed documentation
- Check [ADOT-LAYER-CONFIG.md](./ADOT-LAYER-CONFIG.md) for configuration details
- Review [ARCHITECTURE.md](./ARCHITECTURE.md) for technical details
- Check AWS ADOT documentation: https://aws-otel.github.io/
- OpenTelemetry documentation: https://opentelemetry.io/docs/

## Success Criteria

✅ All 3 Lambda functions deployed successfully  
✅ API Gateway endpoints accessible  
✅ Test scenarios return expected responses  
✅ Traces visible in backend UI  
✅ Trace context propagates across services  
✅ Span attributes contain business data  
✅ Error scenarios traced correctly  

Congratulations! Your Lambda OpenTelemetry Demo is fully operational! 🎉
