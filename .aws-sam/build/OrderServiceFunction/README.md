# Lambda OpenTelemetry Demo

A comprehensive AWS Lambda project demonstrating how to integrate OpenTelemetry for end-to-end distributed tracing across multiple microservices **without using AWS CloudWatch or X-Ray**, using the **AWS Distro for OpenTelemetry (ADOT) Lambda Layer** for automatic instrumentation.

## 🎯 Overview

This project implements a realistic e-commerce order processing workflow using three Lambda functions representing distinct microservices:

1. **Order Service** - Orchestrates the order processing workflow
2. **Inventory Service** - Validates item availability
3. **Payment Service** - Processes payments

The services communicate with each other while propagating trace context using OpenTelemetry, enabling complete visibility into request flows across all services.

## 🏗️ Architecture

```
┌─────────────────┐
│  Order Service  │
│   (Lambda)      │
└────────┬────────┘
         │
         ├──────────────────┐
         │                  │
         ▼                  ▼
┌─────────────────┐  ┌─────────────────┐
│ Inventory Svc   │  │  Payment Svc    │
│   (Lambda)      │  │   (Lambda)      │
└─────────────────┘  └─────────────────┘
         │                  │
         └──────┬───────────┘
                ▼
        OpenTelemetry
         Collector
                │
                ▼
        Tracing Backend
      (Jaeger/Zipkin/etc)
```

## ✨ Features

- ✅ **AWS ADOT Lambda Layer** - Uses AWS Distro for OpenTelemetry Lambda Layer for zero-code instrumentation
- ✅ **Automatic Instrumentation** - Auto-instruments Lambda, HTTP/HTTPS, and AWS SDK without code changes
- ✅ **Distributed Tracing** - End-to-end trace propagation across Lambda functions
- ✅ **W3C Trace Context** - Standard trace context propagation using W3C format
- ✅ **OTLP Export** - Exports traces using OTLP HTTP protocol
- ✅ **Custom Spans** - Manual span creation for business logic insights
- ✅ **No CloudWatch/X-Ray** - Direct export to any OpenTelemetry-compatible backend
- ✅ **Error Scenarios** - Built-in test scenarios for:
  - Out of stock items
  - Payment failures (card declined, insufficient funds)
  - Network errors

## 📋 Prerequisites

- Node.js 18.x or later
- AWS CLI configured with appropriate credentials
- AWS SAM CLI for deployment
- OpenTelemetry Collector or compatible backend (Jaeger, Zipkin, etc.)

## 🚀 Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Set Up OpenTelemetry Backend

You need an OpenTelemetry-compatible backend to receive and visualize traces. Here are some options:

#### Option A: Jaeger (Recommended for local testing)

```bash
# Run Jaeger all-in-one with Docker (or use docker-compose)
docker-compose up -d jaeger

# Or manually:
docker run -d --name jaeger \
  -e COLLECTOR_OTLP_ENABLED=true \
  -p 16686:16686 \
  -p 4318:4318 \
  jaegertracing/all-in-one:latest

# Access Jaeger UI at http://localhost:16686
```

#### Option B: Zipkin

```bash
# Run Zipkin with Docker
docker run -d --name zipkin \
  -p 9411:9411 \
  openzipkin/zipkin:latest

# Note: You'll need an OpenTelemetry Collector to convert OTLP to Zipkin format
```

#### Option C: Grafana Cloud, Honeycomb, or other SaaS providers

Configure the OTEL_EXPORTER_OTLP_ENDPOINT parameter with your provider's endpoint.

### 3. Update Lambda Layer ARN

**Important**: Update the `AdotLayerArn` parameter in `template.yaml` with the correct ARN for your AWS region.

Find the latest ARN for your region here:
- https://aws-otel.github.io/docs/getting-started/lambda/lambda-js

Example ARNs:
- **us-east-1**: `arn:aws:lambda:us-east-1:901920570463:layer:aws-otel-nodejs-amd64-ver-1-18-1:5`
- **us-west-2**: `arn:aws:lambda:us-west-2:901920570463:layer:aws-otel-nodejs-amd64-ver-1-18-1:5`
- **eu-west-1**: `arn:aws:lambda:eu-west-1:901920570463:layer:aws-otel-nodejs-amd64-ver-1-18-1:5`

See [ADOT-LAYER-CONFIG.md](./ADOT-LAYER-CONFIG.md) for complete list.

### 4. Deploy to AWS

```bash
# Build the Lambda functions
sam build

# Deploy (follow the prompts)
sam deploy --guided

# Note the API endpoint from the outputs
```

During `sam deploy --guided`, you'll be prompted to provide:
- **Stack name** (e.g., `lambda-otel-demo`)
- **AWS Region** (e.g., `us-east-1`)
- **OtelCollectorEndpoint** - Your OpenTelemetry Collector endpoint without `/v1/traces` (e.g., `http://your-collector:4318`)
- **Environment** - Deployment environment (e.g., `production`, `staging`)
- **AdotLayerArn** - AWS ADOT Lambda Layer ARN for your region
- Confirm changes before deployment

**Note**: If you're using a collector in a VPC, ensure your Lambda functions have VPC access configured.

### 5. Test the Services

Use the provided test script:

```bash
# Replace with your actual API endpoint from SAM deploy output
./test-api.sh https://your-api-id.execute-api.region.amazonaws.com/Prod
```

Or manually test with curl:

```bash
# Successful order
curl -X POST https://your-api-endpoint/Prod/order \
  -H "Content-Type: application/json" \
  -d @test-payloads.json
```

### 6. View Traces

Open your tracing backend UI:
- Jaeger: http://localhost:16686
- Select service: `order-service`
- Click "Find Traces" to view the end-to-end traces

## 🔧 AWS ADOT Lambda Layer

This project uses the **AWS Distro for OpenTelemetry (ADOT) Lambda Layer** for automatic instrumentation. The layer provides:

### Key Benefits

1. **Zero-Code Instrumentation** - Auto-instruments your Lambda function without code changes
2. **No Dependency Bundling** - OpenTelemetry SDKs are provided by the layer, reducing deployment package size
3. **Automatic Context Propagation** - Trace context is automatically propagated across service calls
4. **AWS-Optimized** - Maintained and supported by AWS with regular updates

### How It Works

The layer works through the `AWS_LAMBDA_EXEC_WRAPPER` environment variable:

```yaml
Environment:
  Variables:
    AWS_LAMBDA_EXEC_WRAPPER: /opt/otel-handler  # Enables auto-instrumentation
    OTEL_SERVICE_NAME: order-service              # Service identifier
    OTEL_TRACES_SAMPLER: AlwaysOn                 # Sampling strategy
    OTEL_EXPORTER_OTLP_ENDPOINT: http://collector:4318
```

When your Lambda function is invoked:
1. The wrapper initializes OpenTelemetry SDK
2. Auto-instrumentation is activated for HTTP, AWS SDK, and Lambda runtime
3. A root span is created for the Lambda invocation
4. Your handler executes within the trace context
5. Spans are exported to your configured OTLP endpoint

### What Gets Instrumented Automatically

- ✅ Lambda function invocations
- ✅ HTTP/HTTPS requests (axios, node-fetch, native http/https)
- ✅ AWS SDK v2 and v3 calls
- ✅ Database clients (when using instrumented libraries)
- ✅ Trace context propagation in headers

### Adding Custom Instrumentation

While the layer handles most instrumentation automatically, you can add custom spans for business logic:

```javascript
const api = require('@opentelemetry/api');

exports.handler = async (event) => {
  const tracer = api.trace.getTracer('my-service');
  
  return tracer.startActiveSpan('custom-operation', async (span) => {
    span.setAttribute('business.attribute', 'value');
    // Your logic here
    span.end();
  });
};
```

For detailed configuration options, see [ADOT-LAYER-CONFIG.md](./ADOT-LAYER-CONFIG.md).

## 📝 Test Scenarios

### Scenario 1: Successful Order ✅

Tests the happy path where all services succeed.

```json
{
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
}
```

**Expected Trace:**
- Order Service → Inventory Service (Success)
- Order Service → Payment Service (Success)
- Order completed with HTTP 200

### Scenario 2: Out of Stock ⚠️

Tests inventory unavailability.

```json
{
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
}
```

**Expected Trace:**
- Order Service → Inventory Service (Out of stock detected)
- Payment Service NOT called
- Order fails with HTTP 409

**Out of Stock Items:**
- `item-003` - Keyboard (0 in stock)
- `item-005` - Headphones (0 in stock)

### Scenario 3: Payment Failure 💳

Tests payment processing failures.

**Card Declined:**
```json
{
  "orderId": "ORD-003",
  "customerId": "CUST-789",
  "paymentMethod": "4111111111111111",
  "items": [{"itemId": "item-001", "quantity": 1, "price": 999.99}]
}
```

**Insufficient Funds:**
```json
{
  "orderId": "ORD-004",
  "customerId": "CUST-999",
  "paymentMethod": "4222222222222222",
  "items": [{"itemId": "item-004", "quantity": 2, "price": 399.99}]
}
```

**Test Payment Methods:**
- `4111111111111111` - Card declined
- `4222222222222222` - Insufficient funds
- `4333333333333333` - Expired card
- Any other value - Success (with 10% random failure rate)

**Expected Trace:**
- Order Service → Inventory Service (Success)
- Order Service → Payment Service (Payment fails)
- Order fails with HTTP 402

## 🔍 Understanding the Traces

Each trace will show:

1. **Span Attributes:**
   - Order ID, Customer ID
   - Item counts and details
   - Payment amounts and methods
   - Service names and versions
   - Success/failure reasons

2. **Span Hierarchy:**
   ```
   process-order (Order Service)
   ├── check-inventory (Order Service -> Inventory Service)
   │   └── check-inventory (Inventory Service)
   └── process-payment (Order Service -> Payment Service)
       └── process-payment (Payment Service)
   ```

3. **Trace Context Propagation:**
   - Trace IDs are consistent across all services
   - Parent-child relationships are maintained
   - W3C traceparent headers are used

## 🛠️ Configuration

### Environment Variables

Configure these in the SAM template or Lambda console:

- `OTEL_EXPORTER_OTLP_ENDPOINT` - OpenTelemetry Collector endpoint (default: `http://localhost:4318/v1/traces`)
- `ENVIRONMENT` - Deployment environment (default: `development`)
- `INVENTORY_SERVICE_URL` - Inventory service endpoint
- `PAYMENT_SERVICE_URL` - Payment service endpoint

### Inventory Configuration

Modify the mock inventory in `src/inventory-service/index.js`:

```javascript
const inventory = {
  'item-001': { name: 'Laptop', quantity: 10 },
  'item-002': { name: 'Mouse', quantity: 50 },
  'item-003': { name: 'Keyboard', quantity: 0 },  // Out of stock
  // Add more items...
};
```

### Payment Configuration

Modify failure patterns in `src/payment-service/index.js`:

```javascript
const FAILURE_PATTERNS = {
  'card-declined': ['4111111111111111', 'card-declined'],
  'insufficient-funds': ['4222222222222222', 'insufficient-funds'],
  // Add more patterns...
};
```

## 📂 Project Structure

```
lambda-opentelemetry-demo/
├── src/
│   ├── order-service/          # Order orchestration service
│   │   └── index.js
│   ├── inventory-service/      # Inventory check service
│   │   └── index.js
│   ├── payment-service/        # Payment processing service
│   │   └── index.js
│   └── shared/                 # Shared utilities
│       ├── tracer.js           # OpenTelemetry setup
│       └── utils.js            # Common utilities
├── template.yaml               # AWS SAM template
├── package.json                # Node.js dependencies
├── test-payloads.json          # Sample test data
├── test-api.sh                 # API test script
└── README.md                   # This file
```

## 🔧 Local Development

To test locally without deploying to AWS:

1. Start your OpenTelemetry backend (e.g., Jaeger)
2. Use AWS SAM Local:

```bash
sam build
sam local start-api --env-vars env.json
```

Create `env.json`:
```json
{
  "Parameters": {
    "OTEL_EXPORTER_OTLP_ENDPOINT": "http://host.docker.internal:4318/v1/traces",
    "INVENTORY_SERVICE_URL": "http://host.docker.internal:3000/inventory",
    "PAYMENT_SERVICE_URL": "http://host.docker.internal:3000/payment"
  }
}
```

## 📊 Observability Best Practices

This demo demonstrates several observability best practices:

1. **Structured Logging** - Logs include trace context for correlation
2. **Semantic Attributes** - Meaningful span attributes for filtering and analysis
3. **Error Handling** - Errors are captured as span events
4. **Business Context** - Business-relevant data in spans (order IDs, amounts, etc.)
5. **Service Naming** - Clear service names for easy identification
6. **Context Propagation** - W3C standard trace context across service boundaries

## 🔐 Security Considerations

- This is a demo project - do not use in production without proper security hardening
- Implement proper authentication/authorization for API endpoints
- Secure OpenTelemetry Collector endpoints
- Use AWS Secrets Manager for sensitive configuration
- Enable API Gateway throttling and request validation

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📄 License

MIT License - See LICENSE file for details

## 🎓 Learning Resources

- [OpenTelemetry Documentation](https://opentelemetry.io/docs/)
- [AWS Lambda Best Practices](https://docs.aws.amazon.com/lambda/latest/dg/best-practices.html)
- [W3C Trace Context](https://www.w3.org/TR/trace-context/)
- [Distributed Tracing Guide](https://opentelemetry.io/docs/concepts/signals/traces/)

## 🐛 Troubleshooting

### Traces not appearing in backend

- Verify OTEL_EXPORTER_OTLP_ENDPOINT is correctly configured
- Check Lambda logs in CloudWatch for errors
- Ensure OpenTelemetry Collector/backend is running and accessible
- Verify network connectivity between Lambda and collector

### Service-to-service calls failing

- Check that service URLs are correctly configured
- Verify API Gateway endpoints are deployed
- Review Lambda function logs for errors
- Check IAM permissions if using private endpoints

### High latency or timeouts

- Increase Lambda timeout in template.yaml
- Check OpenTelemetry Collector performance
- Consider using asynchronous export
- Review batch span processor configuration
