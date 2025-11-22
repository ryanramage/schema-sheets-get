# schema-sheets-get

A CLI tool for retrieving values from a P2P database called Schema Sheets. Designed for scripting and tooling environments where teams need to access configuration values, API keys, or other data without hardcoding them.

## Installation

```bash
npm install -g schema-sheets-get
```

## Usage

```bash
schema-sheets-get [options] <room-key> <query>
```

### Basic Example

```bash
# Single property (returns first field value)
schema-sheets-get -s ./storage <room-key> staging/app1

# Multiple properties with shell-eval format
schema-sheets-get -s ./storage <room-key> staging/app1:api-key,database-url,secret

# Multiple properties with JSON output
schema-sheets-get --json -s ./storage <room-key> staging/app1:api-key,database-url

# Multiple properties with export prefix
schema-sheets-get --export -s ./storage <room-key> staging/app1:api-key,database-url
```

### Options

- `-s, --storage <path>` - Storage directory path for caching (recommended for performance)
- `-j, --json` - Output multiple properties as JSON
- `-e, --export` - Prefix shell-eval output with `export` keyword
- `-b, --blind <key>` - Blind peer keys (can be specified multiple times)
- `-d, --debug` - Enable debug output
- `-h, --help` - Show help information
- `-v, --version` - Show version number

### Arguments

- `<room-key>` - The P2P room key for accessing the Schema Sheets database
- `<query>` - Query path, optionally with properties: `query-name` or `query-name:prop1,prop2,prop3`

## Query Syntax

### Single Property Mode

When you specify just a query name, the tool returns the value of the first field:

```bash
schema-sheets-get -s ./storage <room-key> staging/app1
# Output: value-of-first-field
```

### Multiple Properties Mode

Use a colon (`:`) to separate the query name from property names, and commas (`,`) between properties:

```bash
schema-sheets-get -s ./storage <room-key> staging/app1:api-key,database-url,secret
```

**Output formats:**

1. **Shell-eval format (default)** - Ready for `eval` command:
```bash
API_KEY="value1"
DATABASE_URL="value2"
SECRET="value3"
```

2. **JSON format** (with `--json` flag):
```json
{"api-key":"value1","database-url":"value2","secret":"value3"}
```

3. **Export format** (with `--export` flag):
```bash
export API_KEY="value1"
export DATABASE_URL="value2"
export SECRET="value3"
```

### Property Name Transformation

For shell-eval format, property names are automatically transformed to valid shell variable names:

- `api-key` → `API_KEY`
- `database-url` → `DATABASE_URL`
- `some.nested.value` → `SOME_NESTED_VALUE`
- `redis_url` → `REDIS_URL`

## Shell Integration

### Single Value Retrieval

```bash
# Store result in variable
API_KEY=$(schema-sheets-get -s ./storage <room-key> prod/api-key)

# Use directly in commands
curl -H "Authorization: Bearer $(schema-sheets-get -s ./storage <room-key> prod/token)" https://api.example.com
```

### Multiple Values with eval

```bash
# Load multiple values into environment
eval $(schema-sheets-get -s ./storage <room-key> staging/app1:api-key,database-url,secret)

# Now use the variables
echo $API_KEY
echo $DATABASE_URL
echo $SECRET
```

### Multiple Values with export and source

```bash
# Generate a sourceable file
schema-sheets-get --export -s ./storage <room-key> prod/app1:api-key,db-url > .env

# Source it
source .env

# Or use process substitution
source <(schema-sheets-get --export -s ./storage <room-key> prod/app1:api-key,db-url)
```

### Multiple Values with JSON

```bash
# Get JSON output
CONFIG=$(schema-sheets-get --json -s ./storage <room-key> staging/app1:api-key,database-url)

# Parse with jq
API_KEY=$(echo $CONFIG | jq -r '.["api-key"]')
DATABASE_URL=$(echo $CONFIG | jq -r '.["database-url"]')
```

### Environment-Specific Configuration

```bash
#!/bin/bash

ENVIRONMENT=${1:-staging}
STORAGE_DIR="./schema-sheets-cache"
ROOM_KEY="<your-room-key>"

# Load all environment variables at once
eval $(schema-sheets-get -s "$STORAGE_DIR" "$ROOM_KEY" "$ENVIRONMENT/app1:api-key,database-url,redis-url,secret")

echo "Deploying to $ENVIRONMENT..."
echo "Database: $DATABASE_URL"
echo "Redis: $REDIS_URL"

# Use variables in deployment
deploy-app --api-key "$API_KEY" --database-url "$DATABASE_URL"
```

## CI/CD Integration

### GitHub Actions

```yaml
name: Deploy
on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
          
      - name: Install schema-sheets-get
        run: npm install -g schema-sheets-get
        
      - name: Cache schema sheets storage
        uses: actions/cache@v3
        with:
          path: ./schema-sheets-cache
          key: schema-sheets-${{ runner.os }}-${{ hashFiles('**/package-lock.json') }}
          
      - name: Deploy to production
        env:
          ROOM_KEY: ${{ secrets.SCHEMA_SHEETS_ROOM_KEY }}
        run: |
          # Load all config at once
          eval $(schema-sheets-get -s ./schema-sheets-cache "$ROOM_KEY" prod/app1:api-key,database-url,redis-url)
          
          # Deploy with loaded variables
          echo "Deploying with API_KEY and DATABASE_URL..."
          ./deploy.sh
```

### GitHub Actions with JSON

```yaml
      - name: Get configuration
        id: config
        env:
          ROOM_KEY: ${{ secrets.SCHEMA_SHEETS_ROOM_KEY }}
        run: |
          CONFIG=$(schema-sheets-get --json -s ./cache "$ROOM_KEY" prod/app1:api-key,database-url)
          echo "config=$CONFIG" >> $GITHUB_OUTPUT
          
      - name: Deploy
        run: |
          API_KEY=$(echo '${{ steps.config.outputs.config }}' | jq -r '.["api-key"]')
          DATABASE_URL=$(echo '${{ steps.config.outputs.config }}' | jq -r '.["database-url"]')
          ./deploy.sh "$API_KEY" "$DATABASE_URL"
```

### GitLab CI

```yaml
stages:
  - deploy

variables:
  STORAGE_DIR: "./schema-sheets-cache"

cache:
  paths:
    - schema-sheets-cache/

before_script:
  - npm install -g schema-sheets-get

deploy_production:
  stage: deploy
  script:
    - eval $(schema-sheets-get -s "$STORAGE_DIR" "$SCHEMA_SHEETS_ROOM_KEY" prod/app1:api-key,database-url,redis-url)
    - echo "Deploying with $API_KEY"
    - ./deploy.sh
  only:
    - main
```

### Jenkins Pipeline

```groovy
pipeline {
    agent any
    
    environment {
        STORAGE_DIR = './schema-sheets-cache'
        ROOM_KEY = credentials('schema-sheets-room-key')
    }
    
    stages {
        stage('Setup') {
            steps {
                sh 'npm install -g schema-sheets-get'
            }
        }
        
        stage('Deploy') {
            steps {
                script {
                    // Get JSON output
                    def configJson = sh(
                        script: "schema-sheets-get --json -s ${STORAGE_DIR} ${ROOM_KEY} prod/app1:api-key,database-url,redis-url",
                        returnStdout: true
                    ).trim()
                    
                    def config = readJSON text: configJson
                    
                    // Use configuration
                    sh """
                        ./deploy.sh \
                            --api-key '${config['api-key']}' \
                            --database-url '${config['database-url']}' \
                            --redis-url '${config['redis-url']}'
                    """
                }
            }
        }
    }
}
```

## Docker Integration

### Dockerfile with Multi-Property Support

```dockerfile
FROM node:18-alpine

# Install schema-sheets-get
RUN npm install -g schema-sheets-get

# Create storage directory
RUN mkdir -p /app/schema-sheets-cache

WORKDIR /app
COPY . .

# Example entrypoint that loads config
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]
```

### entrypoint.sh

```bash
#!/bin/sh
set -e

# Load all configuration at once
eval $(schema-sheets-get -s /app/schema-sheets-cache \
    "$SCHEMA_SHEETS_ROOM_KEY" \
    "$ENVIRONMENT/app1:api-key,database-url,redis-url,secret")

# Start application with loaded environment
exec node server.js
```

### Docker Compose

```yaml
version: '3.8'
services:
  app:
    build: .
    environment:
      - SCHEMA_SHEETS_ROOM_KEY=${SCHEMA_SHEETS_ROOM_KEY}
      - ENVIRONMENT=${ENVIRONMENT:-staging}
    volumes:
      - schema-sheets-cache:/app/schema-sheets-cache
    command: |
      sh -c "
        eval $$(schema-sheets-get -s /app/schema-sheets-cache \
          $$SCHEMA_SHEETS_ROOM_KEY \
          $$ENVIRONMENT/app1:api-key,database-url,redis-url)
        
        echo 'Starting with API_KEY and DATABASE_URL loaded'
        node server.js
      "

volumes:
  schema-sheets-cache:
```

## Performance Tips

### Storage Directory

Always use the `-s` flag with a persistent storage directory to cache data between runs:

```bash
# Good - fast subsequent runs
schema-sheets-get -s ./storage <room-key> <query>

# Avoid - slow every time
schema-sheets-get <room-key> <query>
```

### Batch Operations

When retrieving multiple values, use the multi-property syntax instead of multiple calls:

```bash
# Good - single connection, fast
eval $(schema-sheets-get -s ./cache <room-key> prod/app1:api-key,db-url,redis-url,secret)

# Avoid - multiple connections, slow
API_KEY=$(schema-sheets-get -s ./cache <room-key> prod/api-key)
DB_URL=$(schema-sheets-get -s ./cache <room-key> prod/db-url)
REDIS_URL=$(schema-sheets-get -s ./cache <room-key> prod/redis-url)
SECRET=$(schema-sheets-get -s ./cache <room-key> prod/secret)
```

### Pre-warming Cache

In CI/CD pipelines, consider pre-warming the cache:

```bash
# Pre-warm cache (output discarded)
schema-sheets-get -s ./cache "$ROOM_KEY" staging/app1:api-key > /dev/null

# Now subsequent calls are instant
eval $(schema-sheets-get -s ./cache "$ROOM_KEY" staging/app1:api-key,db-url,redis-url)
```

## Common Use Cases

### Multi-Environment Deployment Script

```bash
#!/bin/bash
# deploy.sh

ENVIRONMENT=$1
ROOM_KEY="<your-room-key>"
STORAGE="./cache"

if [ -z "$ENVIRONMENT" ]; then
  echo "Usage: $0 <environment>"
  exit 1
fi

# Load all configuration for the environment
eval $(schema-sheets-get -s "$STORAGE" "$ROOM_KEY" \
  "$ENVIRONMENT/app1:api-key,database-url,redis-url,secret,cdn-url")

# Verify required variables are set
if [ -z "$API_KEY" ] || [ -z "$DATABASE_URL" ]; then
  echo "Error: Required configuration not found"
  exit 1
fi

echo "Deploying to $ENVIRONMENT..."
echo "Database: $DATABASE_URL"
echo "Redis: $REDIS_URL"
echo "CDN: $CDN_URL"

# Deploy with retrieved configuration
deploy-app \
  --api-key "$API_KEY" \
  --database-url "$DATABASE_URL" \
  --redis-url "$REDIS_URL" \
  --secret "$SECRET" \
  --cdn-url "$CDN_URL"
```

### Configuration File Generation

```bash
#!/bin/bash
# generate-config.sh

ENVIRONMENT=${1:-staging}
ROOM_KEY="<your-room-key>"

# Generate .env file
schema-sheets-get --export -s ./cache "$ROOM_KEY" \
  "$ENVIRONMENT/app1:api-key,database-url,redis-url,secret" > .env

echo "Configuration written to .env"
cat .env
```

### JSON Configuration for Applications

```bash
#!/bin/bash
# get-json-config.sh

ENVIRONMENT=${1:-staging}
ROOM_KEY="<your-room-key>"

# Get configuration as JSON
schema-sheets-get --json -s ./cache "$ROOM_KEY" \
  "$ENVIRONMENT/app1:api-key,database-url,redis-url,secret,features" > config.json

echo "Configuration written to config.json"

# Use with Node.js
node -e "const config = require('./config.json'); console.log('API Key:', config['api-key'])"
```

### Dynamic Environment Loading

```bash
#!/bin/bash
# load-env.sh - Source this file to load environment variables

ENVIRONMENT=${SCHEMA_ENV:-staging}
ROOM_KEY=${SCHEMA_SHEETS_ROOM_KEY:?'SCHEMA_SHEETS_ROOM_KEY must be set'}

# Load configuration into current shell
eval $(schema-sheets-get -s ~/.schema-sheets-cache "$ROOM_KEY" \
  "$ENVIRONMENT/app1:api-key,database-url,redis-url,secret")

echo "Environment loaded: $ENVIRONMENT"
echo "API_KEY: ${API_KEY:0:10}..."
echo "DATABASE_URL: $DATABASE_URL"
```

Usage:
```bash
export SCHEMA_SHEETS_ROOM_KEY="<your-room-key>"
export SCHEMA_ENV="production"
source load-env.sh
```

## Security Considerations

### Shell-Eval Safety

The tool automatically escapes special characters in values for shell safety:
- Quotes (`"`)
- Backticks (`` ` ``)
- Dollar signs (`$`)
- Backslashes (`\`)
- Newlines

However, always:
1. Use double quotes around variables: `"$API_KEY"` not `$API_KEY`
2. Validate critical values before use
3. Use `--json` format when possible for additional safety

### Best Practices

1. **Store room keys as secrets** in CI/CD systems
2. **Use appropriate file permissions** for storage directories (e.g., `chmod 700`)
3. **Use temporary storage** in containerized environments when possible
4. **Rotate room keys** periodically
5. **Limit property exposure** - only request properties you need
6. **Use `--json` format** when integrating with other tools for safer parsing

### Example: Secure CI/CD Usage

```yaml
# GitHub Actions - secure example
- name: Deploy
  env:
    ROOM_KEY: ${{ secrets.SCHEMA_SHEETS_ROOM_KEY }}
  run: |
    # Use JSON format for safer parsing
    CONFIG=$(schema-sheets-get --json -s ./cache "$ROOM_KEY" prod/app1:api-key,database-url)
    
    # Parse with jq (safer than eval)
    API_KEY=$(echo "$CONFIG" | jq -r '.["api-key"]')
    DATABASE_URL=$(echo "$CONFIG" | jq -r '.["database-url"]')
    
    # Use in deployment
    ./deploy.sh "$API_KEY" "$DATABASE_URL"
```

## Troubleshooting

### Connection Issues

If you're experiencing connection problems:

1. Verify the room key is correct
2. Check network connectivity
3. Ensure the storage directory is writable
4. Try without storage flag first to test connectivity
5. Use `--debug` flag to see detailed connection information

```bash
schema-sheets-get --debug -s ./storage <room-key> staging/app1:api-key,database-url
```

### Query Not Found

If you get "Query not found" errors:

1. Verify the query name is correct (case-sensitive)
2. Ensure the query exists in Schema Sheets
3. Check that you have access to the room
4. Try listing available queries first (if you have Schema Sheets UI access)

### Property Not Found

If a property is missing from output:

1. The property name must match exactly (case-sensitive)
2. The property must exist in the query results
3. Use `--debug` to see what properties are available
4. Try without property filter first to see all available fields

### Performance Issues

1. Always use a storage directory with `-s` flag
2. Use the same storage directory across runs
3. Consider pre-warming the cache in CI/CD pipelines
4. Use multi-property syntax instead of multiple calls
5. Check network connectivity and latency

### Shell Parsing Issues

If variables aren't being set correctly:

```bash
# Debug: see what's being output
schema-sheets-get -s ./storage <room-key> staging/app1:api-key,database-url

# Verify eval syntax
eval $(schema-sheets-get -s ./storage <room-key> staging/app1:api-key,database-url)
echo "API_KEY=$API_KEY"
echo "DATABASE_URL=$DATABASE_URL"

# Use --export for sourcing
source <(schema-sheets-get --export -s ./storage <room-key> staging/app1:api-key,database-url)
```

## Examples Repository

For more examples and use cases, see the [examples directory](./examples) (coming soon).

## License

MIT
