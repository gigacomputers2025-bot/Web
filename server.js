const express = require('express');
const fs = require('fs');
const { exec } = require('child_process');
const path = require('path');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json({limit: '50mb'}));
app.use(express.static(__dirname));

const BASE_URL = 'https://gigacomputers.com.ar';

function csvEscape(val) {
    if (val == null) return '';
    const s = String(val);
    if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
        return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
}

function generateCatalogCsv() {
    const dataPath = path.join(__dirname, 'data.json');
    const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
    const products = data.products || [];
    const brand = (data.config && data.config.companyName) || 'GIGA Computers';

    const header = 'id,title,description,availability,condition,price,link,image_link,brand,inventory,quantity_to_sell_on_facebook';
    const rows = products.map(p => {
        const id = p.id || '';
        const title = (p.name || '').trim();
        const desc = (p.desc || title || '').trim();
        const availability = 'in stock';
        const condition = 'new';
        const price = (p.price != null ? Number(p.price).toFixed(2) : '0.00') + ' ARS';
        const link = BASE_URL + '/index.html?id=' + encodeURIComponent(id);

        let imageLink = '';
        if (p.image) {
            if (p.image.startsWith('http')) {
                imageLink = p.image;
            } else if (p.image.startsWith('assets/') || p.image.startsWith('/')) {
                imageLink = BASE_URL + '/' + p.image.replace(/^\//, '');
            }
        }

        const inventory = '99';
        const qty = '99';

        return [
            csvEscape(id),
            csvEscape(title),
            csvEscape(desc),
            csvEscape(availability),
            csvEscape(condition),
            csvEscape(price),
            csvEscape(link),
            csvEscape(imageLink),
            csvEscape(brand),
            csvEscape(inventory),
            csvEscape(qty)
        ].join(',');
    });

    const csvContent = header + '\n' + rows.join('\n');
    const csvPath = path.join(__dirname, 'catalog.csv');
    fs.writeFileSync(csvPath, csvContent, 'utf8');
    console.log('-> catalog.csv generado con ' + products.length + ' productos');
    return products.length;
}

// API endpoint para que Nexus POS importe artículos
app.get('/api/products', (req, res) => {
    try {
        const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'data.json'), 'utf8'));
        res.json(data.products || []);
    } catch (e) {
        res.status(500).json({ error: 'Error al leer catálogo' });
    }
});

// API endpoint para que Nexus POS importe configuración de empresa
app.get('/api/config', (req, res) => {
    try {
        const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'data.json'), 'utf8'));
        res.json(data.config || {});
    } catch (e) {
        res.status(500).json({ error: 'Error al leer configuración' });
    }
});

app.post('/api/sync-full', (req, res) => {
    try {
        const { execSync } = require('child_process');
        const repoUrl = "https://github.com/gigacomputers2025-bot/Web.git";
        
        console.log("-> Iniciando sincronización completa del repositorio...");
        
        // 1. Asegurar .gitignore
        const gitignorePath = path.join(__dirname, '.gitignore');
        if (!fs.existsSync(gitignorePath)) {
            fs.writeFileSync(gitignorePath, "node_modules\n.sync_tmp\n.DS_Store\n*.zip\n.git\n");
        }
        
        // 2. Inicializar si no es un repo
        if (!fs.existsSync(path.join(__dirname, '.git'))) {
            execSync('git init', { cwd: __dirname });
            try {
                execSync(`git remote add origin ${repoUrl}`, { cwd: __dirname });
            } catch(e) { /* Ya existe */ }
        }
        
        // 3. Configurar usuario
        execSync('git config user.name "TechStore Admin"', { cwd: __dirname });
        execSync('git config user.email "admin@techstore.local"', { cwd: __dirname });
        
        // 4. Asegurar rama main
        try {
            execSync('git branch -M main', { cwd: __dirname });
        } catch(e) { /* Fallo si no hay commits */ }
        
        // 5. Agregar y commit
        execSync('git add .', { cwd: __dirname });
        try {
            execSync('git commit -m "Manual full sync from Admin Panel"', { cwd: __dirname });
        } catch(e) { /* Nada para commit */ }
        
        // 6. Volver a intentar renombrar si falló antes
        try {
            execSync('git branch -M main', { cwd: __dirname });
        } catch(e) {}
        
        // 7. Push
        execSync('git push -u origin main --force', { cwd: __dirname });
        
        console.log("-> ¡Sincronización completa exitosa!");
        res.json({success: true});
    } catch(e) {
        console.error("Error en sincronización completa:", e.message);
        res.status(500).json({success: false, error: e.message});
    }
});

app.post('/api/save', (req, res) => {
    try {
        fs.writeFileSync(path.join(__dirname, 'data.json'), JSON.stringify(req.body, null, 2));
        
        // Regenerar catalog.csv automaticamente
        try {
            generateCatalogCsv();
        } catch (csvErr) {
            console.error("Error generando catalog.csv en auto-save:", csvErr.message);
        }
        
        res.json({success: true});
        
        // Auto-sync en segundo plano
        setTimeout(() => {
            console.log("-> Cambio detectado. Sincronizando con GitHub de fondo...");
            const { execSync } = require('child_process');
            const repoUrl = "https://github.com/gigacomputers2025-bot/Web.git";
            const tmpDir = path.join(__dirname, '.sync_tmp');
            
            try {
                if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
                execSync(`git clone ${repoUrl} "${tmpDir}"`, {stdio: 'ignore'});
                fs.copyFileSync(path.join(__dirname, 'data.json'), path.join(tmpDir, 'data.json'));
                execSync(`git config user.name "TechStore Admin"`, { cwd: tmpDir });
                execSync(`git config user.email "admin@techstore.local"`, { cwd: tmpDir });
                execSync(`git add data.json`, { cwd: tmpDir });
                try {
                    execSync(`git commit -m "Auto-sync background"`, { cwd: tmpDir, stdio: 'ignore' });
                } catch(commitErr) {
                    // Nothing to commit, ignore
                }
                execSync(`git push origin main`, { cwd: tmpDir, stdio: 'ignore' });
                if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
                console.log("-> ¡Sincronización automática exitosa!");
            } catch(e) {
                if (fs.existsSync(tmpDir)) try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch(err){}
            }
        }, 1000);
        
    } catch(e) {
        res.status(500).json({success: false, error: e.message});
    }
});

// API endpoint para generar catalog.csv para WhatsApp Business Catalog
app.post('/api/generate-catalog-csv', (req, res) => {
    try {
        const count = generateCatalogCsv();
        res.json({ success: true, count });
    } catch (e) {
        console.error("Error generando catalog.csv:", e.message);
        res.status(500).json({ success: false, error: e.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log('--------------------------------------------------');
    console.log('Servidor local iniciado: http://localhost:' + PORT);
    console.log('--------------------------------------------------');

    // Inicializar el Puente automático de SGTaller 3 en segundo plano
    try {
        console.log("-> Iniciando Puente con SGTaller 3...");
        const bridge = require('./sgtaller_bridge.js');
        
        // Función para forzar el git auto-sync cuando el puente importe algo nuevo
        const triggerGitSync = () => {
            console.log("-> Puente SGTaller actualizó data.json. Sincronizando de fondo con GitHub...");
            const { execSync } = require('child_process');
            const repoUrl = "https://github.com/gigacomputers2025-bot/Web.git";
            const tmpDir = path.join(__dirname, '.sync_tmp');
            
            try {
                if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
                execSync(`git clone ${repoUrl} "${tmpDir}"`, {stdio: 'ignore'});
                fs.copyFileSync(path.join(__dirname, 'data.json'), path.join(tmpDir, 'data.json'));
                execSync(`git config user.name "TechStore Admin"`, { cwd: tmpDir });
                execSync(`git config user.email "admin@techstore.local"`, { cwd: tmpDir });
                execSync(`git add data.json`, { cwd: tmpDir });
                try {
                    execSync(`git commit -m "Auto-sync SGTaller Bridge"`, { cwd: tmpDir, stdio: 'ignore' });
                } catch(commitErr) {
                    // Nothing to commit, ignore and proceed to push check
                }
                execSync(`git push origin main`, { cwd: tmpDir, stdio: 'ignore' });
                if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
                console.log("-> ¡Puente SGTaller: Sincronización automática de fondo exitosa!");
            } catch(e) {
                if (fs.existsSync(tmpDir)) try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch(err){}
                console.error("-> Puente SGTaller: Error en auto-sync:", e.message);
            }
        };

        bridge.startLoop(triggerGitSync);
    } catch (e) {
        console.error("-> Error al iniciar el Puente de SGTaller 3:", e.message);
    }
});