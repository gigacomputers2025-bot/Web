const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Color logger for console
const log = {
    info: (msg) => console.log(`\x1b[36m[SGTaller Bridge] ${msg}\x1b[0m`),
    success: (msg) => console.log(`\x1b[32m[SGTaller Bridge] ${msg}\x1b[0m`),
    warn: (msg) => console.log(`\x1b[33m[SGTaller Bridge] ${msg}\x1b[0m`),
    error: (msg, err) => console.error(`\x1b[31m[SGTaller Bridge] ${msg}\x1b[0m`, err || '')
};

// Check and auto-install node-firebird if missing
let firebird;
try {
    firebird = require('node-firebird');
} catch (e) {
    log.info("Instalando conector local de Firebird (node-firebird)... Por favor espera unos segundos.");
    try {
        execSync('npm install node-firebird --no-save', { stdio: 'ignore', cwd: __dirname, shell: true });
        firebird = require('node-firebird');
        log.success("Conector de Firebird instalado correctamente.");
    } catch (err) {
        log.error("Fallo la instalación automática de node-firebird. Por favor ejecute en su consola: npm install node-firebird", err);
        process.exit(1);
    }
}

// Generate secure 5-char tracking code
function generateTrackingCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 5; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

// Safely parse Firebird values (handles BLOB buffers, functions, legacy text)
function safeString(val) {
    if (!val) return '';
    if (typeof val === 'function') return '';
    if (Buffer.isBuffer(val)) {
        try {
            return val.toString('latin1').trim();
        } catch(e) {
            return val.toString('utf8').trim();
        }
    }
    return String(val).trim();
}

// Map Firebird integer status to Web status
function mapStatus(statusVal, entregadoVal) {
    const ent = String(entregadoVal || '').trim().toUpperCase();
    if (ent === 'S') return 'Entregada';
    
    const s = String(statusVal || '').trim().toLowerCase();
    
    // If not delivered yet (entregado === 'N' or empty)
    if (s === '1') return 'En Diagnóstico';
    if (s === '2') return 'En Reparación';
    if (s === '3') return 'Finalizada';
    
    // Fallbacks
    if (s === '0' || s.includes('presupuesto') || s.includes('ingresado')) return 'En Diagnóstico';
    if (s.includes('taller') || s.includes('reparacion')) return 'En Reparación';
    if (s.includes('listo') || s.includes('finalizado')) return 'Finalizada';
    if (s.includes('entregado')) return 'Entregada';
    if (s.includes('diagnostico')) return 'En Diagnóstico';
    if (s.includes('repuesto')) return 'Esperando Repuestos';
    
    return 'Recibida'; // Default fallback
}

// Main Sync Loop
async function runSync(onSuccessCallback) {
    const dataPath = path.join(__dirname, 'data.json');
    if (!fs.existsSync(dataPath)) {
        log.warn("Archivo data.json no encontrado. Saltando sincronización.");
        return;
    }

    let webData;
    try {
        webData = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
    } catch (e) {
        log.error("Error al leer data.json", e);
        return;
    }

    // Default configuration if missing
    if (!webData.config) webData.config = {};
    if (webData.config.sgtallerEnabled === undefined) webData.config.sgtallerEnabled = true;
    if (!webData.config.sgtallerDbPath) {
        webData.config.sgtallerDbPath = "C:\\SGTaller 3 Demo\\Base\\service.fdb";
    }

    if (!webData.config.sgtallerEnabled) {
        log.info("Sincronización con SGTaller 3 deshabilitada en la configuración.");
        return;
    }

    const dbPath = webData.config.sgtallerDbPath;
    if (!fs.existsSync(dbPath)) {
        log.warn(`Base de datos de SGTaller no encontrada en la ruta especificada: ${dbPath}`);
        log.warn("Por favor verifique la ruta en data.json (config.sgtallerDbPath)");
        return;
    }

    const options = {
        host: '127.0.0.1',
        port: 3050,
        database: dbPath,
        user: 'SYSDBA',
        password: 'masterkey',
        lowercase_keys: true,
        role: null,
        pageSize: 4096
    };

    log.info(`Conectando con SGTaller en ${dbPath}...`);

    firebird.attach(options, (err, db) => {
        if (err) {
            log.error("No se pudo conectar a la base de datos Firebird de SGTaller. Asegúrese de que el servicio Firebird esté ejecutándose.", err);
            return;
        }

        log.success("¡Conexión establecida con SGTaller!");

        // Discover Tables and Columns dynamically to support SGTaller custom variations
        db.query("SELECT DISTINCT TRIM(RDB$RELATION_NAME) AS TABLA FROM RDB$RELATION_FIELDS WHERE RDB$SYSTEM_FLAG = 0", (err, tables) => {
            if (err) {
                log.error("Error al consultar tablas del sistema", err);
                db.detach();
                return;
            }

            const tableNames = tables.map(t => String(t.tabla).toUpperCase());
            const clientTable = tableNames.find(t => t === 'CLIENTES' || t === 'CLIENTE') || 'CLIENTES';
            const repairTable = tableNames.find(t => t === 'REPARACIONES' || t === 'REPARACION' || t === 'ORDENES' || t === 'SERVICIOS') || 'REPARACIONES';

            log.info(`Tablas detectadas -> Clientes: ${clientTable}, Reparaciones: ${repairTable}`);

            db.query(`SELECT DISTINCT TRIM(RDB$FIELD_NAME) AS COLUMNA FROM RDB$RELATION_FIELDS WHERE RDB$RELATION_NAME = '${clientTable}'`, (err, clientCols) => {
                if (err) {
                    log.error(`Error al consultar columnas de ${clientTable}`, err);
                    db.detach();
                    return;
                }

                const cCols = clientCols.map(c => String(c.columna).toUpperCase());

                db.query(`SELECT DISTINCT TRIM(RDB$FIELD_NAME) AS COLUMNA FROM RDB$RELATION_FIELDS WHERE RDB$RELATION_NAME = '${repairTable}'`, (err, repairCols) => {
                    if (err) {
                        log.error(`Error al consultar columnas de ${repairTable}`, err);
                        db.detach();
                        return;
                    }

                    const rCols = repairCols.map(c => String(c.columna).toUpperCase());

                    // Map Columns
                    const cId = cCols.find(c => c === 'CODIGO' || c === 'ID_CLIENTE' || c === 'COD_CLIENTE' || c === 'ID') || 'CODIGO';
                    const cName = cCols.find(c => c === 'NOMBRE' || c === 'NOMBRES' || c === 'RAZON_SOCIAL' || c === 'APELLIDO_NOMBRE') || 'NOMBRES';
                    const cPhone = cCols.find(c => c === 'TELEFONO' || c === 'TEL' || c === 'TELEF') || 'TELEFONO';
                    const cCell = cCols.find(c => c === 'CELULAR' || c === 'CEL') || 'CELULAR';
                    const cEmail = cCols.find(c => c === 'EMAIL' || c === 'MAIL') || 'EMAIL';
                    const cAddr = cCols.find(c => c === 'DIRECCION' || c === 'DOMICILIO') || 'DIRECCION';

                    const rId = rCols.find(c => c === 'CODIGO' || c === 'ID_REPARACION' || c === 'ID_ORDEN' || c === 'NRO_ORDEN' || c === 'COD_REPARACION') || 'CODIGO';
                    const rClientFk = rCols.find(c => c === 'CLIENTE' || c === 'ID_CLIENTE' || c === 'COD_CLIENTE') || 'CLIENTE';
                    const rEquip = rCols.find(c => c === 'ARTICULO' || c === 'EQUIPO' || c === 'APARATO') || 'ARTICULO';
                    const rBrand = rCols.find(c => c === 'MARCA');
                    const rModel = rCols.find(c => c === 'MODELO');
                    const rProb = rCols.find(c => c === 'FALLA' || c === 'SINTOMA' || c === 'PROBLEMA') || 'FALLA';
                    const rStatus = rCols.find(c => c === 'ESTADO' || c === 'COD_ESTADO' || c === 'SITUACION') || 'ESTADO';
                    const rDate = rCols.find(c => c === 'FECHAINGRESO' || c === 'FECHA_INGRESO' || c === 'FECHA_ING' || c === 'FECHA') || 'FECHAINGRESO';
                    const rNotes = rCols.find(c => c === 'OBSERVACIONES' || c === 'NOTAS' || c === 'DETALLE' || c === 'INFORMETALLER') || 'OBSERVACIONES';
                    const rEntregado = rCols.find(c => c === 'ENTREGADO') || 'ENTREGADO';

                    log.info("Columnas mapeadas correctamente. Realizando consultas de datos...");

                    // Query Clients
                    const clientQuery = `SELECT ${cId} AS id, 
                        CAST(${cName} AS VARCHAR(200) CHARACTER SET WIN1252) AS name, 
                        CAST(${cPhone} AS VARCHAR(50) CHARACTER SET WIN1252) AS phone, 
                        CAST(${cCell} AS VARCHAR(50) CHARACTER SET WIN1252) AS cell, 
                        CAST(${cEmail} AS VARCHAR(150) CHARACTER SET WIN1252) AS email, 
                        CAST(${cAddr} AS VARCHAR(250) CHARACTER SET WIN1252) AS addr 
                        FROM ${clientTable}`;
                    db.query(clientQuery, (err, sClients) => {
                        if (err) {
                            log.error("Error al consultar clientes", err);
                            db.detach();
                            return;
                        }
 
                        // Query Repairs (Joining with APARATO and TIPO_APARATO to get correct brand, model, and equipment type)
                        const repairQuery = `
                            SELECT 
                                r.${rId} AS id,
                                r.${rClientFk} AS client_id,
                                CAST(ta.NOMBRE AS VARCHAR(100) CHARACTER SET WIN1252) AS equip,
                                CAST(ap.MARCA AS VARCHAR(100) CHARACTER SET WIN1252) AS brand,
                                CAST(ap.MODELO AS VARCHAR(100) CHARACTER SET WIN1252) AS model,
                                CAST(r.${rProb} AS VARCHAR(2000) CHARACTER SET WIN1252) AS prob,
                                r.${rStatus} AS status,
                                CAST(r.${rEntregado} AS VARCHAR(10) CHARACTER SET WIN1252) AS entregado,
                                r.${rDate} AS date_ing,
                                CAST(r.${rNotes} AS VARCHAR(4000) CHARACTER SET WIN1252) AS notes,
                                (SELECT FIRST 1 p.TOTAL FROM PRESUPUESTOS p WHERE p.IDREPARACION = r.${rId} ORDER BY p.CODIGO DESC) AS budget_total
                            FROM ${repairTable} r
                            LEFT JOIN APARATO ap ON r.NS = ap.NS
                            LEFT JOIN TIPO_APARATO ta ON ap.TIPOAPARATO = ta.CODIGO
                        `;
                        db.query(repairQuery, (err, sRepairs) => {
                            if (err) {
                                log.error("Error al consultar reparaciones", err);
                                db.detach();
                                return;
                            }

                            log.info(`Importados de SGTaller -> Clientes: ${sClients.length}, Reparaciones: ${sRepairs.length}`);

                             // Process Clients
                             const importedClients = sClients.map(sc => {
                                 const phoneNum = safeString(sc.phone || sc.cell);
                                 return {
                                     id: `CLI-SGT-${safeString(sc.id)}`,
                                     name: safeString(sc.name) || 'Sin Nombre',
                                     phone: phoneNum,
                                     email: safeString(sc.email),
                                     address: safeString(sc.addr)
                                 };
                             });
 
                             // Process Repairs and keep code consistency
                             const existingRepairs = webData.repairs || [];
                             const usedCodes = new Set(existingRepairs.map(r => r.code));
                             
                             const importedRepairs = sRepairs.map(sr => {
                                 const webId = `REP-SGT-${safeString(sr.id)}`;
                                 
                                 // Preserve existing tracking code if already imported before
                                 const matched = existingRepairs.find(r => r.id === webId);
                                 let code = matched ? matched.code : null;
                                 
                                 if (!code) {
                                     do {
                                         code = generateTrackingCode();
                                     } while (usedCodes.has(code));
                                     usedCodes.add(code);
                                 }
 
                                 // Combine equipment details
                                 const cleanBrand = safeString(sr.brand);
                                 const cleanModel = safeString(sr.model);
                                 
                                 const isNone = (str) => {
                                     const s = str.toLowerCase().trim();
                                     return s === '' || s === '(ninguno)' || s === 'ninguno' || s === 'ninguna' || s === '(ninguna)';
                                 };
                                 
                                 const brandStr = isNone(cleanBrand) ? '' : ` ${cleanBrand}`;
                                 const modelStr = isNone(cleanModel) ? '' : ` ${cleanModel}`;
                                 const equipmentName = `${safeString(sr.equip || 'Equipo')}${brandStr}${modelStr}`.trim();
 
                                 // Date parse
                                 let dateString;
                                 try {
                                     dateString = sr.date_ing ? new Date(sr.date_ing).toISOString().split('T')[0] : new Date().toISOString().split('T')[0];
                                 } catch(e) {
                                     dateString = new Date().toISOString().split('T')[0];
                                 }
 
                                 // Filter: only keep repairs from year 2026 onwards
                                 const year = parseInt(dateString.split('-')[0], 10);
                                 if (year < 2026) return null;
 
                                 return {
                                     id: webId,
                                     code: code,
                                     clientId: `CLI-SGT-${safeString(sr.client_id)}`,
                                     equipment: equipmentName || 'Equipo',
                                     status: mapStatus(sr.status, sr.entregado),
                                     problem: safeString(sr.prob) || 'Sin detalle de falla',
                                     notes: safeString(sr.notes),
                                     date: dateString,
                                     price: sr.budget_total !== undefined && sr.budget_total !== null ? parseFloat(sr.budget_total) : 0
                                 };
                             }).filter(r => r !== null);

                            // Merge into web data (Replace SGTaller items, keep non-SGTaller manual items)
                            const localClients = (webData.clients || []).filter(c => !c.id.startsWith('CLI-SGT-'));
                            const mergedClients = [...localClients, ...importedClients];

                            const localRepairs = (webData.repairs || []).filter(r => !r.id.startsWith('REP-SGT-'));
                            const mergedRepairs = [...localRepairs, ...importedRepairs];

                            // Update data object
                            webData.clients = mergedClients;
                            webData.repairs = mergedRepairs;

                            // Save to data.json
                            fs.writeFileSync(dataPath, JSON.stringify(webData, null, 2));
                            log.success("¡Base de datos combinada y guardada exitosamente en data.json!");

                            db.detach();

                            // Trigger complete sync if callback exists
                            if (onSuccessCallback) {
                                onSuccessCallback();
                            }
                        });
                    });
                });
            });
        });
    });
}

// Background loop runner
let loopInterval = null;
function startLoop(onSuccessCallback) {
    if (loopInterval) clearInterval(loopInterval);

    // Initial run
    setTimeout(() => {
        runSync(onSuccessCallback).catch(e => log.error("Error en ejecución inicial", e));
    }, 2000);

    // Dynamic interval check (default 2 minutes)
    const intervalMs = 2 * 60 * 1000; 
    loopInterval = setInterval(() => {
        runSync(onSuccessCallback).catch(e => log.error("Error en bucle de sincronización", e));
    }, intervalMs);

    log.info(`Bucle de sincronización con SGTaller 3 iniciado (intervalo de 2 minutos).`);
}

module.exports = {
    runSync,
    startLoop
};
