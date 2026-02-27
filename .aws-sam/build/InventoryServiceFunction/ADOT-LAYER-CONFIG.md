# AWS ADOT Lambda Layer Configuration Guide

This document explains how to configure and use the AWS Distro for OpenTelemetry (ADOT) Lambda Layer for automatic instrumentation.

## Overview

The AWS ADOT Lambda Layer provides automatic OpenTelemetry instrumentation for Lambda functions without requiring you to bundle OpenTelemetry SDKs in your deployment package.

## Layer ARNs by Region

### Node.js 18.x ADOT Layer ARNs (Latest: v1-18-1)

| Region | ARN |
|--------|-----|
| us-east-1 | `arn:aws:lambda:us-east-1:901920570463:layer:aws-otel-nodejs-amd64-ver-1-18-1:5` |
| us-east-2 | `arn:aws:lambda:us-east-2:901920570463:layer:aws-otel-nodejs-amd64-ver-1-18-1:5` |
| us-west-1 | `arn:aws:lambda:us-west-1:901920570463:layer:aws-otel-nodejs-amd64-ver-1-18-1:5` |
| us-west-2 | `arn:aws:lambda:us-west-2:901920570463:layer:aws-otel-nodejs-amd64-ver-1-18-1:5` |
| eu-west-1 | `arn:aws:lambda:eu-west-1:901920570463:layer:aws-otel-nodejs-amd64-ver-1-18-1:5` |
| eu-central-1 | `arn:aws:lambda:eu-central-1:901920570463:layer:aws-otel-nodejs-amd64-ver-1-18-1:5` |
| ap-southeast-1 | `arn:aws:lambda:ap-southeast-1:901920570463:layer:aws-otel-nodejs-amd64-ver-1-18-1:5` |
| ap-northeast-1 | `arn:aws:lambda:ap-northeast-1:901920570463:layer:aws-otel-nodejs-amd64-ver-1-18-1:5` |

**Find the latest ARNs**: https://aws-otel.github.io/docs/getting-started/lambda/lambda-js

## Required Environment Variables

### Essential Configuration

```yaml
Environment:
  Variables:
    # Enable ADOT auto-instrumentation wrapper
    AWS_LAMBDA_EXEC_WRAPPER: /opt/otel-handler
    
    # Service name for identification in traces
    OTEL_SERVICE_NAME: your-service-name
    
    # Sampling configuration (AlwaysOn for demo, adjust for production)
    OTEL_TRACES_SAMPLER: AlwaysOn
    
    # Protocol for OTLP export
    OTEL_EXPORTER_OTLP_PROTOCOL: http/protobuf
    
    # OpenTelemetry Collector endpoint (without /v1/traces)
    OTEL_EXPORTER_OTLP_ENDPOINT: http://your-collector:4318
    
    # Trace context propagation format
    OTEL_PROPAGATORS: tracecontext
```

### Advanced Configuration Options

```yaml
Environment:
  Variables:
    # Resource attributes (for environment, version, etc.)
    OTEL_RESOURCE_ATTRIBUTES: deployment.environment=production,service.version=1.0.0
    
    # Specific endpoint for traces (optional, overrides OTEL_EXPORTER_OTLP_ENDPOINT)
    OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: http://your-collector:4318/v1/traces
    
    # Enable/disable specific instrumentations
    OTEL_INSTRUMENTATION_AWS_SDK_ENABLED: true
    OTEL_INSTRUMENTATION_HTTP_ENABLED: true
    
    # Span attribute limits
    OTEL_SPAN_ATTRIBUTE_VALUE_LENGTH_LIMIT: 4095
    OTEL_SPAN_ATTRIBUTE_COUNT_LIMIT: 128
```

## Exporter Backends

### 1. Jaeger (Local Development)

```yaml
OTEL_EXPORTER_OTLP_ENDPOINT: http://localhost:4318
OTEL_EXPORTER_OTLP_PROTOCOL: http/protobuf
```

Run Jaeger with OTLP support:
```bash
docker run -d --name jaeger \
  -e COLLECTOR_OTLP_ENABLED=true \
  -p 16686:16686 \
  -p 4318:4318 \
  jaegertracing/all-in-one:latest
```

### 2. AWS X-Ray (with ADOT Collector)

If you want to send traces to AWS X-Ray, deploy an ADOT Collector in your VPC:

```yaml
OTEL_EXPORTER_OTLP_ENDPOINT: http://adot-collector:4318
OTEL_PROPAGATORS: tracecontext,xray
```

ADOT Collector configuration:
```yaml
receivers:
  otlp:
    protocols:
      http:
        endpoint: 0.0.0.0:4318

exporters:
  awsxray:
    region: us-east-1

service:
  pipelines:
    traces:
      receivers: [otlp]
      exporters: [awsxray]
```

### 3. Grafana Cloud / Honeycomb / DataDog

```yaml
OTEL_EXPORTER_OTLP_ENDPOINT: https://your-saas-endpoint
OTEL_EXPORTER_OTLP_HEADERS: Authorization=Bearer your-api-key
```

### 4. Self-Hosted OpenTelemetry Collector

Deploy a collector in your VPC or use Lambda Extension:

```yaml
OTEL_EXPORTER_OTLP_ENDPOINT: http://collector:4318
```

## How Auto-Instrumentation Works

### 1. Wrapper Execution

The `AWS_LAMBDA_EXEC_WRAPPER` environment variable points to `/opt/otel-handler`, which:
- Initializes the OpenTelemetry SDK before your handler
- Automatically instruments common libraries (http, https, aws-sdk, etc.)
- Creates a root span for each Lambda invocation
- Propagates trace context from incoming requests

### 2. Automatic Instrumentation

The layer automatically instruments:
- ✅ AWS SDK calls
- ✅ HTTP/HTTPS requests (axios, node-fetch, http, https)
- ✅ Lambda invocation (creates root span)
- ✅ Downstream service calls with trace context propagation

### 3. Context Propagation

The layer automatically:
- Extracts W3C trace context from incoming API Gateway requests
- Injects trace context into outgoing HTTP requests
- Maintains trace context across async operations

## Usage in Your Code

### Basic Usage (Automatic)

With the layer configured, your Lambda function is automatically instrumented:

```javascript
exports.handler = async (event) => {
  // Automatically traced!
  const response = await axios.get('https://api.example.com');
  return { statusCode: 200, body: JSON.stringify(response.data) };
};
```

### Adding Custom Spans

For additional business logic spans:

```javascript
const api = require('@opentelemetry/api');

exports.handler = async (event) => {
  const tracer = api.trace.getTracer('my-service', '1.0.0');
  
  return tracer.startActiveSpan('business-operation', async (span) => {
    try {
      span.setAttribute('customer.id', event.customerId);
      
      // Your business logic
      const result = await processOrder(event);
      
      span.setStatus({ code: api.SpanStatusCode.OK });
      return result;
    } catch (error) {
      span.recordException(error);
      span.setStatus({ code: api.SpanStatusCode.ERROR });
      throw error;
    } finally {
      span.end();
    }
  });
};
```

### Adding Attributes to Current Span

```javascript
const api = require('@opentelemetry/api');

exports.handler = async (event) => {
  const span = api.trace.getActiveSpan();
  if (span) {
    span.setAttribute('order.id', event.orderId);
    span.setAttribute('order.amount', event.amount);
  }
  
  // Your handler logic
};
```

## Trace Context Propagation

### Automatic (HTTP Clients)

The layer automatically propagates context for instrumented HTTP clients:

```javascript
const axios = require('axios');

// Trace context is automatically added to headers!
const response = await axios.post('https://api.example.com/payment', data);
```

### Manual (Custom Clients)

For custom HTTP clients or non-instrumented libraries:

```javascript
const api = require('@opentelemetry/api');

function getTraceHeaders() {
  const headers = {};
  const span = api.trace.getActiveSpan();
  
  if (span) {
    const spanContext = span.spanContext();
    headers.traceparent = `00-${spanContext.traceId}-${spanContext.spanId}-01`;
  }
  
  return headers;
}

// Use in your custom client
const headers = { ...getTraceHeaders(), 'Content-Type': 'application/json' };
```

## Sampling

### AlwaysOn (Development/Demo)

```yaml
OTEL_TRACES_SAMPLER: AlwaysOn
```

Traces every request. Good for development but expensive in production.

### TraceIdRatioBased (Production)

```yaml
OTEL_TRACES_SAMPLER: TraceIdRatioBased
OTEL_TRACES_SAMPLER_ARG: 0.1  # 10% sampling
```

Samples a percentage of requests to reduce costs.

### ParentBased (Recommended)

```yaml
OTEL_TRACES_SAMPLER: ParentBased_TraceIdRatioBased
OTEL_TRACES_SAMPLER_ARG: 0.1
```

Respects parent sampling decisions while applying ratio-based sampling to root spans.

## Performance Considerations

### Cold Start Impact

The ADOT layer adds ~200-300ms to cold start time:
- Layer initialization: ~100ms
- Auto-instrumentation setup: ~100-200ms

### Runtime Overhead

- Minimal overhead during warm execution (<5ms per invocation)
- Async span export doesn't block Lambda execution
- Batching reduces network calls

### Optimization Tips

1. **Use provisioned concurrency** for latency-sensitive functions
2. **Adjust span limits** to reduce memory usage:
   ```yaml
   OTEL_SPAN_ATTRIBUTE_COUNT_LIMIT: 32
   OTEL_SPAN_EVENT_COUNT_LIMIT: 32
   ```
3. **Use sampling** in high-volume environments
4. **Disable unused instrumentations**:
   ```yaml
   OTEL_INSTRUMENTATION_AWS_LAMBDA_ENABLED: true
   OTEL_INSTRUMENTATION_HTTP_ENABLED: true
   OTEL_INSTRUMENTATION_AWS_SDK_ENABLED: false
   ```

## Troubleshooting

### No Traces Appearing

1. Check CloudWatch Logs for ADOT errors:
   ```
   grep "otel" /aws/lambda/your-function
   ```

2. Verify environment variables:
   ```bash
   aws lambda get-function-configuration --function-name your-function \
     --query 'Environment.Variables'
   ```

3. Test collector endpoint connectivity:
   - Ensure Lambda has network access to the collector
   - Check security groups and NACLs
   - Verify collector is accepting OTLP HTTP on port 4318

### Wrapper Not Running

Error: `AWS_LAMBDA_EXEC_WRAPPER is set but the wrapper does not exist`

**Solution**: Verify the layer ARN is correct and matches your region.

### Trace Context Not Propagating

1. Ensure `OTEL_PROPAGATORS=tracecontext` is set
2. Check if HTTP library is supported (axios, node-fetch, http, https)
3. For unsupported libraries, manually inject headers

### High Cold Start Times

1. Consider using Lambda SnapStart (if available)
2. Use provisioned concurrency
3. Minimize layer count (combine layers if possible)
4. Profile and optimize your application code

## Best Practices

1. **Set meaningful service names**: Use descriptive names that reflect the business function
2. **Add business context**: Include order IDs, customer IDs, and other relevant attributes
3. **Handle errors properly**: Record exceptions and set error status on spans
4. **Use semantic conventions**: Follow OpenTelemetry semantic conventions for consistency
5. **Monitor collector health**: Ensure your collector is performant and highly available
6. **Set appropriate sampling**: Balance cost with observability needs
7. **Use tags for filtering**: Add environment, version, and region as resource attributes

## References

- AWS ADOT Lambda: https://aws-otel.github.io/docs/getting-started/lambda
- OpenTelemetry Lambda Instrumentation: https://opentelemetry.io/docs/platforms/faas/lambda-auto-instrument/
- W3C Trace Context: https://www.w3.org/TR/trace-context/
- OpenTelemetry Semantic Conventions: https://opentelemetry.io/docs/specs/semconv/
