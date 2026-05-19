const express = require('express');
const fs = require('fs');
const { exec } = require('child_process');
const path = require('path');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json({limit: '50mb'}));
app.use(express.static(__dirname));

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