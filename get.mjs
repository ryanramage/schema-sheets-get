#!/usr/bin/env node
import { header, footer, command, flag, arg, summary, description } from 'paparam'
import goodbye from 'graceful-goodbye'
import Corestore from 'corestore'
import Hyperswarm from 'hyperswarm'
import Wakeup from 'protomux-wakeup'
import BlindPeering from 'blind-peering'
import SchemaSheets from 'schema-sheets'
import z32 from 'z32'
import { rm } from 'fs/promises'
import tempPath from 'temp-path'

const startTime = Date.now()

// get from the cli
const cmd = command('get', summary('get'), 
  header('Get data from a schema-sheet using a named query or JMESPath query'),
  arg('<roomLink>', 'the room link key from schema-sheets'),
  arg('<query>', 'JMESPath query to execute, or named query when using -n flag'),
  flag('--named-query|-n', 'Treat query argument as a named query (optionally with :property1,property2)'),
  flag('--storage|-s [storage]', 'Path to storage directory'),
  flag('--blind|-b [blind]', 'Blind peer keys (can be specified multiple times)').multiple(),
  flag('--json|-j', 'Output as JSON (for multiple properties)'),
  flag('--export|-e', 'Prefix output with export (for multiple properties)'),
  flag('--debug|-d', 'Enable debug output')
) 
const args = cmd.parse()

const debug = args.flags.debug ? console.log : () => {}

debug(`[${Date.now() - startTime}ms] Args parsed`)

const DEFAULT_BLIND_PEER_KEYS = args.flags.blind || []
const storagePath = args.flags.storage || tempPath()
debug('using storagePath', storagePath)

debug(`[${Date.now() - startTime}ms] Creating store, swarm, wakeup, blind...`)
const store = new Corestore(storagePath)
const swarm = new Hyperswarm()
const wakeup = new Wakeup()
const blind = new BlindPeering(swarm, store, { wakeup, mirrors: DEFAULT_BLIND_PEER_KEYS })
debug(`[${Date.now() - startTime}ms] Store, swarm, wakeup, blind created`)

swarm.on('connection', c => {
  debug(`[${Date.now() - startTime}ms] Swarm connection established`)
  c.on('close', function () {})
  store.replicate(c)
  wakeup.addStream(c)
})

async function cleanup() {
  debug(`[${Date.now() - startTime}ms] Cleaning up...`)
  blind.close()
  swarm.destroy()
  store.close()
  
  // Only remove storage if it wasn't explicitly provided by user
  if (!args.flags.storage) {
    try {
      await rm(storagePath, { recursive: true, force: true })
      debug(`[${Date.now() - startTime}ms] Temporary storage removed`)
    } catch (error) {
      console.error('Error removing temp storage:', error)
    }
  } else {
    debug(`[${Date.now() - startTime}ms] Keeping user-provided storage at: ${storagePath}`)
  }
}

goodbye(cleanup)

debug(`[${Date.now() - startTime}ms] Decoding room link...`)
const decoded = z32.decode(args.args.roomLink);
const key = decoded.subarray(0, 32);
const encryptionKey = decoded.subarray(32);
debug(`[${Date.now() - startTime}ms] Room link decoded`)

debug(`[${Date.now() - startTime}ms] Creating SchemaSheets...`)
const sheets = new SchemaSheets(store, key, { 
  encryptionKey, 
  wakeup
});
debug(`[${Date.now() - startTime}ms] SchemaSheets created`)

debug(`[${Date.now() - startTime}ms] Waiting for sheets.ready()...`)
await sheets.ready();
debug(`[${Date.now() - startTime}ms] sheets.ready() complete`)

debug(`[${Date.now() - startTime}ms] Joining swarm...`)
await swarm.join(sheets.base.discoveryKey)
debug(`[${Date.now() - startTime}ms] Swarm joined`)

debug(`[${Date.now() - startTime}ms] Adding autobase background...`)
blind.addAutobaseBackground(sheets.base)
debug(`[${Date.now() - startTime}ms] Autobase background added`)

function escapeShellValue(value) {
  // Convert to string and escape special characters for shell safety
  const str = String(value)
  // Escape backslashes first, then quotes, then other special chars
  return str
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/`/g, '\\`')
    .replace(/\$/g, '\\$')
    .replace(/\n/g, '\\n')
}

function propertyToVarName(property) {
  // Convert property name to valid shell variable name
  // Replace hyphens, dots, and other non-alphanumeric chars with underscores
  // Convert to uppercase
  return property
    .replace(/[^a-zA-Z0-9_]/g, '_')
    .toUpperCase()
}

async function executeQuery() {
  try {
    const queryInput = args.args.query
    
    // Get the first schema
    debug(`[${Date.now() - startTime}ms] Getting schemas...`)
    const schemas = await getSchemas(sheets)
    debug(`[${Date.now() - startTime}ms] Schemas retrieved: ${schemas.length} found`)
    
    if (!schemas.length) {
      console.error('No schemas found')
      await cleanup()
      process.exit(1)
    }
    
    const schemaId = schemas[0].schemaId
    debug(`[${Date.now() - startTime}ms] Using schema ID: ${schemaId}`)
    
    let results
    
    if (args.flags.namedQuery) {
      // Named query mode - parse for property selection
      const colonIndex = queryInput.indexOf(':')
      let queryName, properties
      
      if (colonIndex !== -1) {
        queryName = queryInput.substring(0, colonIndex)
        const propertiesStr = queryInput.substring(colonIndex + 1)
        properties = propertiesStr.split(',').map(p => p.trim()).filter(p => p.length > 0)
        debug(`[${Date.now() - startTime}ms] Named query: ${queryName}, properties: ${properties.join(', ')}`)
      } else {
        queryName = queryInput
        properties = null
        debug(`[${Date.now() - startTime}ms] Named query single property mode: ${queryName}`)
      }
      
      // Get the named query
      debug(`[${Date.now() - startTime}ms] Listing queries...`)
      const queries = await sheets.listQueries(schemaId)
      debug(`[${Date.now() - startTime}ms] Queries retrieved: ${queries.length} found`)
      
      const query = queries.find(q => q.name === queryName)
      
      if (!query) {
        console.error(`Query "${queryName}" not found`)
        await cleanup()
        process.exit(1)
      }
      
      debug(`[${Date.now() - startTime}ms] Found query: ${query.name}`)
      
      // Execute the named query
      debug(`[${Date.now() - startTime}ms] Executing named query...`)
      results = await sheets.list(schemaId, { query: query.JMESPathQuery })
      debug(`[${Date.now() - startTime}ms] Named query executed, ${results.length} results`)
      
      if (results.length === 0) {
        console.error('No results found')
        await cleanup()
        process.exit(1)
      }
      
      const asJson = results[0].json
      
      if (!properties) {
        // Single property mode (backward compatible)
        const firstField = Object.keys(asJson)[0]
        const value = asJson[firstField]
        console.log(value)
      } else {
        // Multiple properties mode
        if (args.flags.json) {
          // JSON output
          const output = {}
          properties.forEach(prop => {
            if (asJson[prop] !== undefined) {
              output[prop] = asJson[prop]
            }
          })
          console.log(JSON.stringify(output))
        } else {
          // Shell-eval format (default for multiple properties)
          const exportPrefix = args.flags.export ? 'export ' : ''
          properties.forEach(prop => {
            if (asJson[prop] !== undefined) {
              const varName = propertyToVarName(prop)
              const value = escapeShellValue(asJson[prop])
              console.log(`${exportPrefix}${varName}="${value}"`)
            }
          })
        }
      }
    } else {
      // JMESPath query mode
      debug(`[${Date.now() - startTime}ms] JMESPath query: ${queryInput}`)
      
      // Execute the JMESPath query directly
      debug(`[${Date.now() - startTime}ms] Executing JMESPath query...`)
      results = await sheets.list(schemaId, { query: queryInput })
      debug(`[${Date.now() - startTime}ms] JMESPath query executed, ${results.length} results`)
      
      if (results.length === 0) {
        console.error('No results found')
        await cleanup()
        process.exit(1)
      }
      
      // For JMESPath queries, output the results based on format flags
      if (args.flags.json) {
        // JSON output - output all results
        if (results.length === 1) {
          console.log(JSON.stringify(results[0].json))
        } else {
          console.log(JSON.stringify(results.map(r => r.json)))
        }
      } else {
        // Shell-eval format - flatten first result if it's an object
        const firstResult = results[0].json
        if (typeof firstResult === 'object' && firstResult !== null && !Array.isArray(firstResult)) {
          const exportPrefix = args.flags.export ? 'export ' : ''
          Object.keys(firstResult).forEach(prop => {
            const varName = propertyToVarName(prop)
            const value = escapeShellValue(firstResult[prop])
            console.log(`${exportPrefix}${varName}="${value}"`)
          })
        } else {
          // Non-object result, just output the value
          console.log(firstResult)
        }
      }
    }
    
    // Clean up and exit
    await cleanup()
    debug(`[${Date.now() - startTime}ms] Done!`)
    process.exit(0)
  } catch (error) {
    console.error('Error:', error)
    await cleanup()
    process.exit(1)
  }
}

// Try to execute immediately (for local data)
debug(`[${Date.now() - startTime}ms] Attempting immediate query execution...`)
executeQuery().catch(() => {
  // If immediate execution fails, wait a bit for sync and try again
  debug(`[${Date.now() - startTime}ms] Immediate execution failed, waiting for sync...`)
  setTimeout(() => {
    debug(`[${Date.now() - startTime}ms] Retrying after sync delay...`)
    executeQuery()
  }, 200)
})

async function getSchemas(sheets) {
  let schemas = []
  let retries = 3
  
  while (retries > 0 && schemas.length === 0) {
    try {
      debug(`[${Date.now() - startTime}ms] Attempting to list schemas (${4 - retries}/3)...`)
      schemas = await sheets.listSchemas()
      debug(`[${Date.now() - startTime}ms] listSchemas() returned ${schemas.length} schemas`)
      
      if (schemas.length === 0) {
        retries--
        if (retries > 0) {
          debug(`[${Date.now() - startTime}ms] No schemas found, waiting 2s before retry...`)
          await new Promise(resolve => setTimeout(resolve, 2000))
        }
      }
    } catch (error) {
      debug(`[${Date.now() - startTime}ms] Error listing schemas: ${error.message}`)
      retries--
      if (retries > 0) {
        debug(`[${Date.now() - startTime}ms] Waiting 2s before retry...`)
        await new Promise(resolve => setTimeout(resolve, 2000))
      }
    }
  }

  return schemas
}
