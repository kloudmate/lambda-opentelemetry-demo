#!/bin/bash

# Simple local testing script using SAM Local
# This script starts SAM local API and runs tests

set -e

echo "Starting Lambda OpenTelemetry Demo Local Test"
echo "=============================================="
echo ""

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "Error: Docker is not running. Please start Docker first."
    exit 1
fi

# Check if Jaeger is running
if ! docker ps | grep -q jaeger-otel; then
    echo "Starting Jaeger..."
    docker-compose up -d jaeger
    echo "Waiting for Jaeger to be ready..."
    sleep 5
else
    echo "Jaeger is already running"
fi

echo ""
echo "Jaeger UI available at: http://localhost:16686"
echo ""

# Build the Lambda functions
echo "Building Lambda functions..."
sam build

if [ $? -ne 0 ]; then
    echo "Error: Build failed"
    exit 1
fi

echo ""
echo "Lambda functions built successfully!"
echo ""
echo "To test the API:"
echo "1. Start SAM local API in one terminal:"
echo "   sam local start-api --env-vars env.json"
echo ""
echo "2. In another terminal, run the test script:"
echo "   ./test-api.sh http://127.0.0.1:3000"
echo ""
echo "3. View traces in Jaeger UI:"
echo "   http://localhost:16686"
echo ""
