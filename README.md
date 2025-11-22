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
schema-sheets-get -s ./storage 1aawsxq6d41yqjy5md97fdow7so5k87nwmn597qzwbntt53zbkggyobirsdfgwbcmwso7a51pwjood3mntamransz4wjtuqb3rsrt7sys4g test/main
```

### Options

- `-s, --storage <path>` - Storage directory path for caching (recommended for performance)
- `-h, --help` - Show help information
- `-v, --version` - Show version number

### Arguments

- `<room-key>` - The P2P room key for accessing the Schema Sheets database
- `<query>` - Query path to retrieve a specific value (e.g., `test/main`, `prod/api-key`)

## Shell Integration

### Basic Shell Usage

```bash
# Store result in variable
API_KEY=$(schema-sheets-get -s ./storage <room-key> prod/api-key)

# Use directly in commands
curl -H "Authorization: Bearer $(schema-sheets-get -s ./storage <room-key> prod/token)" https://api.example.com
```

### Environment-Specific Configuration

```bash
#!/bin/bash

ENVIRONMENT=${1:-staging}
STORAGE_DIR="./schema-sheets-cache"
ROOM_KEY="1aawsxq6d41yqjy5md97fdow7so5k87nwmn597qzwbntt53zbkggyobirsdfgwbcmwso7a51pwjood3mntamransz4wjtuqb3rsrt7sys4g"

# Get environment-specific values
DB_URL=$(schema-sheets-get -s "$STORAGE_DIR" "$ROOM_KEY" "$ENVIRONMENT/database-url")
API_KEY=$(schema-sheets-get -s "$STORAGE_DIR" "$ROOM_KEY" "$ENVIRONMENT/api-key")
SECRET=$(schema-sheets-get -s "$STORAGE_DIR" "$ROOM_KEY" "$ENVIRONMENT/secret")

echo "Deploying to $ENVIRONMENT..."
echo "Database: $DB_URL"
# Use variables in deployment...
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
          API_KEY=$(schema-sheets-get -s ./schema-sheets-cache "$ROOM_KEY" prod/api-key)
          DATABASE_URL=$(schema-sheets-get -s ./schema-sheets-cache "$ROOM_KEY" prod/database-url)
          # Use variables in deployment commands...
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
    - API_KEY=$(schema-sheets-get -s "$STORAGE_DIR" "$SCHEMA_SHEETS_ROOM_KEY" prod/api-key)
    - DATABASE_URL=$(schema-sheets-get -s "$STORAGE_DIR" "$SCHEMA_SHEETS_ROOM_KEY" prod/database-url)
    # Use variables in deployment...
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
                    def apiKey = sh(
                        script: "schema-sheets-get -s ${STORAGE_DIR} ${ROOM_KEY} prod/api-key",
                        returnStdout: true
                    ).trim()
                    
                    def dbUrl = sh(
                        script: "schema-sheets-get -s ${STORAGE_DIR} ${ROOM_KEY} prod/database-url", 
                        returnStdout: true
                    ).trim()
                    
                    // Use variables in deployment...
                }
            }
        }
    }
}
```

## Docker Integration

### Dockerfile

```dockerfile
FROM node:18-alpine

# Install schema-sheets-get
RUN npm install -g schema-sheets-get

# Create storage directory
RUN mkdir -p /app/schema-sheets-cache

WORKDIR /app
COPY . .

# Example usage in entrypoint
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]
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
        API_KEY=$$(schema-sheets-get -s /app/schema-sheets-cache $$SCHEMA_SHEETS_ROOM_KEY $$ENVIRONMENT/api-key)
        DATABASE_URL=$$(schema-sheets-get -s /app/schema-sheets-cache $$SCHEMA_SHEETS_ROOM_KEY $$ENVIRONMENT/database-url)
        # Start your application with these variables
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

When retrieving multiple values, consider using a wrapper script:

```bash
#!/bin/bash
# get-config.sh

STORAGE_DIR="./schema-sheets-cache"
ROOM_KEY="$1"
ENVIRONMENT="$2"

# Pre-populate cache with a single connection
schema-sheets-get -s "$STORAGE_DIR" "$ROOM_KEY" "$ENVIRONMENT/api-key" > /dev/null

# Now subsequent calls will be fast
API_KEY=$(schema-sheets-get -s "$STORAGE_DIR" "$ROOM_KEY" "$ENVIRONMENT/api-key")
DB_URL=$(schema-sheets-get -s "$STORAGE_DIR" "$ROOM_KEY" "$ENVIRONMENT/database-url")
SECRET=$(schema-sheets-get -s "$STORAGE_DIR" "$ROOM_KEY" "$ENVIRONMENT/secret")

echo "API_KEY=$API_KEY"
echo "DB_URL=$DB_URL" 
echo "SECRET=$SECRET"
```

## Common Use Cases

### Multi-Environment Deployment

```bash
#!/bin/bash
# deploy.sh

ENVIRONMENT=$1
ROOM_KEY="your-room-key-here"
STORAGE="./cache"

case $ENVIRONMENT in
  "staging")
    API_KEY=$(schema-sheets-get -s "$STORAGE" "$ROOM_KEY" staging/app1/api-key)
    DB_URL=$(schema-sheets-get -s "$STORAGE" "$ROOM_KEY" staging/app1/database-url)
    ;;
  "rc")
    API_KEY=$(schema-sheets-get -s "$STORAGE" "$ROOM_KEY" rc/app1/api-key)
    DB_URL=$(schema-sheets-get -s "$STORAGE" "$ROOM_KEY" rc/app1/database-url)
    ;;
  "prod")
    API_KEY=$(schema-sheets-get -s "$STORAGE" "$ROOM_KEY" prod/app1/api-key)
    DB_URL=$(schema-sheets-get -s "$STORAGE" "$ROOM_KEY" prod/app1/database-url)
    ;;
esac

# Deploy with retrieved configuration
deploy-app --api-key "$API_KEY" --database-url "$DB_URL"
```

### Configuration Management

```bash
# Load all environment variables from schema sheets
eval $(schema-sheets-get -s ./storage <room-key> env/production | sed 's/^/export /')

# Or load specific configurations
export DATABASE_URL=$(schema-sheets-get -s ./storage <room-key> prod/database-url)
export REDIS_URL=$(schema-sheets-get -s ./storage <room-key> prod/redis-url)
export API_SECRET=$(schema-sheets-get -s ./storage <room-key> prod/api-secret)
```

## Troubleshooting

### Connection Issues

If you're experiencing connection problems:

1. Verify the room key is correct
2. Check network connectivity
3. Ensure the storage directory is writable
4. Try without storage flag first to test connectivity

### Performance Issues

1. Always use a storage directory with `-s` flag
2. Use the same storage directory across runs
3. Consider pre-warming the cache in CI/CD pipelines

### Security Considerations

1. Store room keys as secrets in CI/CD systems
2. Use appropriate file permissions for storage directories
3. Consider using temporary storage directories in containerized environments
4. Rotate room keys periodically

## License

MIT
