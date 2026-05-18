/**
 * Catálogo de Ventas de Computación - App Logic
 */

// --- DB Module (localStorage) ---
const DB = {
    keys: {
        products: 'techstore_products',
        clients: 'techstore_clients',
        repairs: 'techstore_repairs',
        services: 'techstore_services',
        config: 'techstore_config',
        categories: 'techstore_categories'
    },
    
    _cache: {},

    utils: {
        debounce(fn, delay) {
            let timeout;
            return (...args) => {
                clearTimeout(timeout);
                timeout = setTimeout(() => fn(...args), delay);
            };
        }
    },
    
    async init() {
        try {
            // Usamos un versionado más controlado que Date.now() para permitir el cache del navegador
            const res = await fetch('data.json?v=2'); 
            if (res.ok) {
                const data = await res.json();
                Object.keys(this.keys).forEach(key => {
                    if (data[key]) {
                        localStorage.setItem(this.keys[key], JSON.stringify(data[key]));
                        this._cache[key] = data[key];
                    }
                });
                return;
            }
        } catch (e) {
            console.log("No data.json found or fetch failed, falling back to local defaults.");
        }

        // Cargar defaults si no hay nada en localStorage
        Object.keys(this.keys).forEach(key => {
            if (!localStorage.getItem(this.keys[key])) {
                const defaultKey = 'default' + key.charAt(0).toUpperCase() + key.slice(1);
                if (this[defaultKey]) {
                    localStorage.setItem(this.keys[key], JSON.stringify(this[defaultKey]));
                }
            }
        });
    },

    async syncToServer(showModal = false) {
        const data = {
            products: this.get('products'),
            clients: this.get('clients'),
            repairs: this.get('repairs'),
            services: this.get('services'),
            config: this.getConfig(),
            categories: this.get('categories')
        };
        
        if (showModal) {
            Modal.open(`
                <div style="text-align: center; padding: 2rem;">
                    <div class="anim-spin" style="font-size: 3rem; color: var(--accent-blue); margin-bottom: 1rem;">
                        <i class="ph ph-spinner-gap"></i>
                    </div>
                    <h2>Sincronizando Cambios</h2>
                    <p style="color: var(--text-muted);">Guardando datos localmente y subiendo a la web...</p>
                </div>
            `);
        } else {
            Toast.show('Sincronizando con la web...', 'sync');
        }
        
        try {
            const res = await fetch('/api/save', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(data)
            });
            
            const result = await res.json();
            
            if (res.ok && result.success) {
                const s = result.syncResult || { local: true, github: true };
                
                if (showModal) {
                    Modal.open(`
                        <div style="text-align: center; padding: 1rem;">
                            <div style="display: flex; align-items: center; justify-content: center; gap: 1rem;">
                                <i class="ph ph-check-circle" style="font-size: 2.5rem;"></i>
                                <h2 style="margin: 0; color: white;">¡Cambios Guardados!</h2>
                            </div>
                            <p style="margin: 0.5rem 0 1rem 0; opacity: 0.9;">${s.github ? 'Todo sincronizado con éxito.' : 'Guardado local OK (Error GitHub).'}</p>
                            <button class="btn btn-primary" onclick="Modal.close()" style="min-width: 150px;">Cerrar</button>
                        </div>
                    `, 'top success');
                } else {
                    Toast.show(s.github ? 'Cambios sincronizados' : 'Error en Sincronización Web', s.github ? 'success' : 'warning');
                }
                
                if (s.github) {
                    localStorage.setItem('last_github_sync', new Date().toLocaleTimeString());
                }
                StatusBar.update();
            } else {
                throw new Error(result.error || 'Error en el servidor');
            }
        } catch(e) {
            if (showModal) {
                Modal.open(`
                    <div style="text-align: center; padding: 2rem;">
                        <div style="font-size: 4rem; color: var(--danger); margin-bottom: 1rem;"><i class="ph ph-x-circle"></i></div>
                        <h2>Error de Sincronización</h2>
                        <p>${e.message}</p>
                        <button class="btn btn-secondary w-100 mt-4" onclick="Modal.close()">Cerrar</button>
                    </div>
                `);
            } else {
                Toast.show('Error de sincronización: ' + e.message, 'error');
            }
        }
    },

    get(key) {
        if (this._cache[key]) return this._cache[key];
        const data = JSON.parse(localStorage.getItem(this.keys[key])) || [];
        this._cache[key] = data;
        if (key === 'categories' && Array.isArray(data)) {
            return data.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
        }
        return data;
    },

    set(key, data, sync = true) {
        this._cache[key] = data;
        localStorage.setItem(this.keys[key], JSON.stringify(data));
        if (sync) this.syncToServer();
    },

    add(key, item, sync = true) {
        const data = this.get(key);
        item.id = Date.now().toString() + Math.random().toString(36).substring(2, 6);
        data.push(item);
        this.set(key, data, sync);
        return item;
    },

    update(key, id, updatedItem, sync = true) {
        const data = this.get(key);
        const index = data.findIndex(item => item.id === id);
        if (index !== -1) {
            data[index] = { ...data[index], ...updatedItem };
            this.set(key, data, sync);
        }
    },

    delete(key, id, sync = true) {
        const items = this.get(key).filter(item => item.id != id);
        this.set(key, items, sync);
    },

    getConfig() {
        if (this._cache.config) return this._cache.config;
        const stored = JSON.parse(localStorage.getItem(this.keys.config));
        const config = stored ? { ...this.defaultConfig, ...stored } : this.defaultConfig;
        this._cache.config = config;
        return config;
    },

    setConfig(config, sync = true) {
        this._cache.config = config;
        localStorage.setItem(this.keys.config, JSON.stringify(config));
        if (sync) this.syncToServer();
    },

    exportData() {
        const data = {
            products: this.get('products'),
            clients: this.get('clients'),
            repairs: this.get('repairs'),
            services: this.get('services'),
            config: this.getConfig(),
            categories: this.get('categories')
        };
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `techstore_backup_${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);
    },

    importData(jsonString) {
        try {
            const data = JSON.parse(jsonString);
            if (data.products) this.set('products', data.products);
            if (data.clients) this.set('clients', data.clients);
            if (data.repairs) this.set('repairs', data.repairs);
            if (data.services) this.set('services', data.services);
            if (data.config) this.setConfig(data.config);
            if (data.categories) this.set('categories', data.categories);
            this.syncToServer();
            return true;
        } catch (e) {
            console.error('Error importing data:', e);
            return false;
        }
    },

    // Sample Data
    defaultConfig: {
        companyName: 'TechStore Computación',
        address: 'Av. Corrientes 1234, CABA',
        phone: '011-1234-5678',
        email: 'contacto@techstore.com',
        whatsapp: '5491100000000',
        hours: 'Lun a Vie 9:00 a 18:00 - Sáb 10:00 a 14:00',
        instagram: 'https://instagram.com/techstore',
        facebook: 'https://facebook.com/techstore',
        popupActive: false,
        popupImage: '',
        popupDuration: 10,
        popupText: '',
        popupDelay: 1,
        popupAlways: false,
        homeProductLimit: 20,
        homeRandomOrder: false,
        googleAnalyticsId: '', // ID de seguimiento (G-XXXXXXXXXX)
        gtmId: '',             // ID de Tag Manager (GTM-XXXXXXX)
        siteTitle: '',         // Título personalizado para SEO
        siteDescription: ''    // Descripción personalizada para SEO
    },
    defaultCategories: [
        { id: '1', name: 'Notebooks' },
        { id: '2', name: 'PCs de Escritorio' },
        { id: '3', name: 'Periféricos' },
        { id: '4', name: 'Componentes' },
        { id: '5', name: 'Accesorios' }
    ],
    defaultProducts: [
        { id: '1', name: 'Notebook Gamer Pro 15"', category: 'Notebooks', price: 1200000, desc: 'Intel Core i7 12th Gen, RTX 3060, 16GB RAM, 512GB SSD NVMe. Ideal para gaming y diseño.', image: 'https://images.unsplash.com/photo-1603302576837-37561b2e2302?auto=format&fit=crop&w=500&q=60', oferta: true, oldPrice: 1400000 },
        { id: '2', name: 'PC Oficina Basic', category: 'PCs de Escritorio', price: 450000, desc: 'Intel Core i3, 8GB RAM, 240GB SSD. Incluye teclado y mouse. Perfecta para tareas de oficina.', image: 'https://images.unsplash.com/photo-1587202372634-32705e3bf49c?auto=format&fit=crop&w=500&q=60', oferta: false },
        { id: '3', name: 'Monitor LED 24" IPS', category: 'Periféricos', price: 180000, desc: 'Monitor Full HD 1080p, panel IPS, 75Hz, HDMI y VGA. Bordes ultra finos.', image: 'https://images.unsplash.com/photo-1527443224154-c4a3942d3acf?auto=format&fit=crop&w=500&q=60', oferta: true, oldPrice: 210000 },
        { id: '4', name: 'Teclado Mecánico RGB', category: 'Periféricos', price: 65000, desc: 'Switches Blue, retroiluminación RGB personalizable, formato TKL.', image: 'https://images.unsplash.com/photo-1595225476474-87563907a212?auto=format&fit=crop&w=500&q=60', oferta: false },
        { id: '5', name: 'Mouse Gamer 10000 DPI', category: 'Periféricos', price: 35000, desc: 'Sensor óptico de alta precisión, 6 botones programables, iluminación RGB.', image: 'https://images.unsplash.com/photo-1527814050087-379381547969?auto=format&fit=crop&w=500&q=60', oferta: false },
        { id: '6', name: 'Placa de Video RTX 4060', category: 'Componentes', price: 550000, desc: 'NVIDIA GeForce RTX 4060 8GB GDDR6. Rendimiento extremo.', image: 'https://images.unsplash.com/photo-1591488320449-011701bb6704?auto=format&fit=crop&w=500&q=60', oferta: false },
        { id: '7', name: 'Memoria RAM 16GB DDR4', category: 'Componentes', price: 48000, desc: 'Módulo de 16GB 3200MHz con disipador.', image: 'https://images.unsplash.com/photo-1562976540-1502c2145186?auto=format&fit=crop&w=500&q=60', oferta: true, oldPrice: 55000 },
        { id: '8', name: 'SSD NVMe 1TB', category: 'Componentes', price: 85000, desc: 'Disco de estado sólido M.2 NVMe PCIe Gen3. Velocidad de lectura hasta 3500MB/s.', image: 'https://images.unsplash.com/photo-1597849021876-25807dd3b3c1?auto=format&fit=crop&w=500&q=60', oferta: false },
        { id: '9', name: 'Auriculares Inalámbricos', category: 'Accesorios', price: 75000, desc: 'Conectividad Bluetooth 5.0, sonido envolvente, micrófono incorporado.', image: 'https://images.unsplash.com/photo-1618366712010-f4ae9c647dcb?auto=format&fit=crop&w=500&q=60', oferta: false },
        { id: '10', name: 'Impresora Multifunción', category: 'Periféricos', price: 210000, desc: 'Imprime, escanea y copia. Conectividad WiFi.', image: 'https://images.unsplash.com/photo-1612815154858-60aa4c59eaa6?auto=format&fit=crop&w=500&q=60', oferta: false }
    ],
    defaultClients: [
        { id: '1', name: 'Juan Pérez', phone: '1122334455', email: 'juan@email.com', address: 'Calle Falsa 123' },
        { id: '2', name: 'María Gómez', phone: '1199887766', email: 'maria@email.com', address: 'Avenida Siempreviva 742' }
    ],
    defaultRepairs: [
        { id: 'REP-001', clientId: '1', equipment: 'Notebook HP', problem: 'No enciende, pantalla negra.', status: 'Recibida', date: '2023-10-25', notes: 'Trae cargador original.' },
        { id: 'REP-002', clientId: '2', equipment: 'PC de Escritorio', problem: 'Muy lenta, virus sospechoso.', status: 'En Reparación', date: '2023-10-26', notes: 'Respaldar datos antes de formatear.' },
        { id: 'REP-003', clientId: '1', equipment: 'Monitor LG', problem: 'Líneas verticales en pantalla.', status: 'Esperando Repuestos', date: '2023-10-24', notes: 'Se pidió placa T-CON.' }
    ],
    defaultServices: [
        { id: 'S-001', name: 'Limpieza y Mantenimiento', desc: 'Limpieza interna completa, cambio de pasta térmica y optimización básica del sistema.', price: 25000, icon: 'ph-broom' },
        { id: 'S-002', name: 'Instalación de Sistema Operativo', desc: 'Formateo, instalación de Windows, drivers esenciales y programas básicos.', price: 35000, icon: 'ph-windows-logo' },
        { id: 'S-003', name: 'Armado a Medida', desc: 'Ensamblaje profesional de PC con gestión de cables y pruebas de estrés.', price: 50000, icon: 'ph-wrench' }
    ]
};

// --- Auth Module ---
const Auth = {
    key: 'techstore_auth',
    
    login(username, password) {
        // Hardcoded admin for demo
        if (username === 'admin' && password === 'HolaTula10') {
            localStorage.setItem(this.key, 'true');
            return true;
        }
        return false;
    },
    
    logout() {
        localStorage.removeItem(this.key);
        Router.navigate('/admin/login');
    },
    
    isAuthenticated() {
        return localStorage.getItem(this.key) === 'true';
    }
};

// --- WhatsApp Integration ---
const WA = {
    formatNumber(num) {
        return num.replace(/\D/g, '');
    },
    
    openProduct(productName) {
        const config = DB.getConfig();
        if (!config.whatsapp) return;
        const msg = encodeURIComponent(`Hola, quisiera consultar sobre el producto: ${productName}`);
        window.open(`https://wa.me/${this.formatNumber(config.whatsapp)}?text=${msg}`, '_blank');
    },

    openService(serviceName) {
        const config = DB.getConfig();
        if (!config.whatsapp) return;
        const msg = encodeURIComponent(`Hola, quisiera consultar sobre el servicio: ${serviceName}`);
        window.open(`https://wa.me/${this.formatNumber(config.whatsapp)}?text=${msg}`, '_blank');
    },
    
    openGeneral() {
        const config = DB.getConfig();
        if (!config.whatsapp) return;
        const msg = encodeURIComponent(`Hola, quisiera hacer una consulta.`);
        window.open(`https://wa.me/${this.formatNumber(config.whatsapp)}?text=${msg}`, '_blank');
    },

    sendRepairDetails(clientName, clientPhone, code, equipment) {
        if (!clientPhone) return;
        const config = DB.getConfig();
        const msg = encodeURIComponent(`Hola ${clientName}! 👋\n\nRegistramos tu equipo *${equipment}* para reparación.\n\nPuedes seguir el estado desde nuestra web con esta clave:\n\n*${code}*\n\nGracias por confiar en *${config.companyName}*!`);
        window.open(`https://wa.me/${this.formatNumber(clientPhone)}?text=${msg}`, '_blank');
    },

    updateFloatingButton() {
        const config = DB.getConfig();
        const btn = document.getElementById('floating-wa');
        if (config.whatsapp) {
            btn.style.display = 'flex';
            btn.onclick = (e) => {
                e.preventDefault();
                this.openGeneral();
            };
        } else {
            btn.style.display = 'none';
        }
    }
};

// --- Modal System ---
const Modal = {
    overlay: document.getElementById('modal-base'),
    content: document.getElementById('modal-content'),
    
    open(html, type = '') {
        this.overlay.className = 'modal-overlay ' + type;
        this.content.className = 'modal-content glass ' + (type.includes('success') ? 'success-top' : '');
        this.content.innerHTML = html;
        this.overlay.classList.add('active');
    },
    
    close() {
        this.overlay.classList.remove('active');
        this.overlay.className = 'modal-overlay';
        this.content.className = 'modal-content glass';
    }
};

// Close modal on click outside
document.getElementById('modal-base').addEventListener('click', (e) => {
    if (e.target.id === 'modal-base') Modal.close();
});

// --- Toast System ---
const Toast = {
    container: document.getElementById('toast-container'),
    icon: document.getElementById('toast-icon'),
    message: document.getElementById('toast-message'),
    timeout: null,

    show(msg, type = 'info', duration = 4000) {
        if (this.timeout) clearTimeout(this.timeout);
        
        this.message.textContent = msg;
        this.container.className = 'toast-notification active ' + type;
        
        // Set Icon
        if (type === 'success') this.icon.className = 'ph ph-check-circle';
        else if (type === 'error') this.icon.className = 'ph ph-warning-circle';
        else if (type === 'warning') this.icon.className = 'ph ph-warning';
        else if (type === 'sync') this.icon.className = 'ph ph-spinner-gap anim-spin';
        else this.icon.className = 'ph ph-info';

        this.timeout = setTimeout(() => {
            this.container.classList.remove('active');
        }, duration);
    }
};

// --- Status Bar System ---
const StatusBar = {
    update() {
        const bar = document.getElementById('admin-status-bar');
        if (!bar) return;
        
        const products = DB.get('products');
        const lastSync = localStorage.getItem('last_github_sync') || 'Nunca';
        
        bar.innerHTML = `
            <div class="status-item">
                <span class="status-dot ${window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' ? 'online' : 'offline'}"></span>
                <strong>Servidor Local:</strong> ${window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' ? 'Conectado' : 'Sin Conexión'}
            </div>
            <div class="status-item">
                <i class="ph ph-package"></i>
                <strong>Productos en disco:</strong> ${products.length}
            </div>
            <div class="status-item">
                <i class="ph ph-cloud-check"></i>
                <strong>Último Sync GitHub:</strong> ${lastSync}
            </div>
        `;
    }
};

const formatMoney = (amount) => {
    return new Intl.NumberFormat('es-AR', { 
        style: 'currency', 
        currency: 'ARS',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    }).format(amount);
};

// --- Stats Module (Visits Counter) ---
const Stats = {
    apiKey: 'gigacomputers-lujan-stats',
    baseUrl: 'https://api.counterapi.dev/v1',

    async increment() {
        // No incrementar en localhost para no falsear estadísticas
        if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') return;
        
        try {
            await fetch(`${this.baseUrl}/${this.apiKey}/hits/up`);
        } catch (e) {}
    },

    async getHits() {
        try {
            const res = await fetch(`${this.baseUrl}/${this.apiKey}/hits`);
            const data = await res.json();
            return data.count || 0;
        } catch (e) {
            return '---';
        }
    }
};

// --- UI Helpers ---
const UI = {
    updateConfig() {
        const config = DB.getConfig();
        // Actualizar título de la ventana
        document.title = config.companyName || 'Catálogo de Ventas';
        // Actualizar el logo en la barra de navegación
        const brand = document.querySelector('.nav-brand');
        if (brand) {
            brand.innerHTML = `<i class="ph ph-cpu"></i> ${config.companyName}`;
        }
        
        // Actualizar Footer
        const footerTitle = document.getElementById('footer-company-name-title');
        if (footerTitle) footerTitle.textContent = config.companyName;
        
        const footerAddress = document.querySelector('#footer-address span');
        if (footerAddress) footerAddress.textContent = config.address;
        
        const footerPhone = document.querySelector('#footer-phone span');
        if (footerPhone) footerPhone.textContent = config.phone;
        
        const footerEmail = document.querySelector('#footer-email span');
        if (footerEmail) footerEmail.textContent = config.email;
        
        const footerHours = document.querySelector('#footer-hours span');
        if (footerHours) footerHours.textContent = config.hours;
        
        const footerIG = document.getElementById('footer-ig');
        if (footerIG) footerIG.href = config.instagram || '#';
        
        const footerFB = document.getElementById('footer-fb');
        if (footerFB) footerFB.href = config.facebook || '#';
        
        const footerBottom = document.getElementById('footer-company-name-bottom');
        if (footerBottom) footerBottom.textContent = config.companyName;

        // --- SEO & Meta Tags ---
        if (config.siteTitle) {
            document.title = config.siteTitle;
        }
        
        let metaDesc = document.querySelector('meta[name="description"]');
        if (!metaDesc) {
            metaDesc = document.createElement('meta');
            metaDesc.setAttribute('name', 'description');
            document.head.appendChild(metaDesc);
        }
        if (config.siteDescription) {
            metaDesc.setAttribute('content', config.siteDescription);
        }

        // --- Metrics (GTM & GA4) ---
        if (typeof window.initMetrics === 'function') {
            window.initMetrics(config.gtmId, config.googleAnalyticsId);
        }

        // Inject GTM Noscript if needed
        const noscriptContainer = document.getElementById('gtm-noscript-container');
        if (noscriptContainer && config.gtmId && !noscriptContainer.innerHTML) {
            noscriptContainer.innerHTML = `<noscript><iframe src="https://www.googletagmanager.com/ns.html?id=${config.gtmId}" height="0" width="0" style="display:none;visibility:hidden"></iframe></noscript>`;
        }
    }
};

// --- Pages Renderers ---
const Pages = {
    app: document.getElementById('app'),

    renderCatalog(filterOfertas = false, highlightId = null) {
        const allProducts = DB.get('products');
        const config = DB.getConfig();
        let products = filterOfertas ? allProducts.filter(p => p.oferta) : allProducts;
        
        // Aplicar orden aleatorio si está activo y no hay filtros/búsqueda previa
        if (config.homeRandomOrder && !filterOfertas && !highlightId) {
            products = [...products].sort(() => Math.random() - 0.5);
        }

        // Aplicar límite si está configurado y no hay highlightId
        if (config.homeProductLimit && config.homeProductLimit > 0 && !filterOfertas && !highlightId) {
            products = products.slice(0, config.homeProductLimit);
        }

        const categories = DB.get('categories');

        // Si viene un highlightId, nos aseguramos de que el producto esté en la lista (incluso si no es oferta)
        if (highlightId) {
            const highlightedProduct = allProducts.find(p => p.id === highlightId);
            if (highlightedProduct && !products.find(p => p.id === highlightId)) {
                products = [highlightedProduct, ...products];
            }
        }

        const title = filterOfertas ? 'Ofertas Destacadas' : 'Catálogo de Productos';

        let html = `
            ${filterOfertas ? `<h1>${title}</h1>` : ''}
            
            <div class="filter-bar glass">
                <div class="filter-bar-content">
                    <div class="search-container" style="flex: 1;">
                        <i class="ph ph-magnifying-glass search-icon"></i>
                        <input type="text" id="search-input" class="form-control search-input" placeholder="Buscar productos...">
                    </div>
                    <div class="sort-container">
                        <select id="sort-select" class="form-control" style="width: 200px;">
                            <option value="none">Ordenar por...</option>
                            <option value="price-asc">Menor precio</option>
                            <option value="price-desc">Mayor precio</option>
                        </select>
                    </div>
                </div>
            </div>

            <div class="catalog-layout">
                <aside class="catalog-sidebar glass">
                    <h3 class="sidebar-title">Categorías</h3>
                    <ul class="category-list">
                        <li class="category-item active" data-category="all">Todas</li>
                        ${categories.map(cat => `<li class="category-item" data-category="${cat.name}">${cat.name}</li>`).join('')}
                    </ul>
                </aside>
                <div class="catalog-main">
                    <div class="product-grid" id="product-grid">
                        ${this._generateProductCards(products, highlightId)}
                    </div>
                </div>
            </div>
        `;
        this.app.innerHTML = html;

        // Si hay un ID para resaltar, scrollear hasta él
        if (highlightId) {
            setTimeout(() => {
                const element = document.querySelector(`.product-card[data-id="${highlightId}"]`);
                if (element) {
                    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    element.classList.add('highlight-pulse');
                }
            }, 500);
        }

        // Mostrar Popup si está activo
        const shouldShowPopup = config.popupActive && (config.popupImage || config.popupText);
        const alreadyShown = sessionStorage.getItem('popupShown');

        if (shouldShowPopup && (config.popupAlways || !alreadyShown)) {
            setTimeout(() => {
                Modal.open(`
                    <div class="modal-header" style="justify-content: center; position: relative;">
                        <h3 style="margin: 0;">Aviso Importante</h3>
                        <button class="modal-close" onclick="Modal.close()" style="position: absolute; right: 0;"><i class="ph ph-x"></i></button>
                    </div>
                    <div style="text-align: center;">
                        ${config.popupText ? `<div style="margin-bottom: 1.5rem; font-size: 1.1rem; line-height: 1.6; color: var(--text-main);">${config.popupText.replace(/\n/g, '<br>')}</div>` : ''}
                        ${config.popupImage ? `<img src="${config.popupImage}" style="max-width: 100%; border-radius: 0.5rem; box-shadow: var(--shadow-lg);">` : ''}
                    </div>
                    <div style="display: flex; justify-content: center; width: 100%;">
                        <button class="btn btn-primary mt-4" style="min-width: 200px;" onclick="Modal.close()">Entendido</button>
                    </div>
                `);
                sessionStorage.setItem('popupShown', 'true');
                
                // Auto-cerrar según la duración configurada
                if (config.popupDuration && config.popupDuration > 0) {
                    setTimeout(() => {
                        Modal.close();
                    }, config.popupDuration * 1000);
                }
            }, (config.popupDelay || 1) * 1000);
        }

        const updateGrid = () => {
            const query = document.getElementById('search-input').value.trim().toLowerCase();
            const activeCat = document.querySelector('.category-item.active').dataset.category;
            
            let filtered = filterOfertas ? allProducts.filter(p => p.oferta) : allProducts;
            if (activeCat !== 'all') {
                filtered = filtered.filter(p => p.category === activeCat);
            }
            if (query) {
                const queryWords = query.split(/\s+/);
                filtered = filtered.filter(p => {
                    const name = (p.name || "").toLowerCase();
                    const desc = (p.desc || "").toLowerCase();
                    const combined = name + " " + desc;
                    return queryWords.every(word => combined.includes(word));
                });
            }

            const sort = document.getElementById('sort-select').value;
            if (sort === 'price-asc') {
                filtered.sort((a, b) => a.price - b.price);
            } else if (sort === 'price-desc') {
                filtered.sort((a, b) => b.price - a.price);
            }

            document.getElementById('product-grid').innerHTML = this._generateProductCards(filtered);
            this._attachProductEvents();
        };

        // Category filtering logic
        document.querySelectorAll('.category-item').forEach(item => {
            item.addEventListener('click', () => {
                document.querySelectorAll('.category-item').forEach(i => i.classList.remove('active'));
                item.classList.add('active');
                updateGrid();
                window.scrollTo({ top: 0, behavior: 'smooth' });
            });
        });

        // Search and Sort logic
        const debouncedUpdate = DB.utils.debounce(updateGrid, 200);
        document.getElementById('search-input').addEventListener('input', debouncedUpdate);
        document.getElementById('sort-select').addEventListener('change', updateGrid);

        this._attachProductEvents();
    },

    _generateProductCards(products, highlightId = null) {
        if (products.length === 0) {
            return `<div class="empty-state" style="grid-column: 1 / -1;"><i class="ph ph-package"></i><p>No se encontraron productos.</p></div>`;
        }

        return products.map(p => `
            <div class="product-card glass ${p.id === highlightId ? 'highlighted' : ''}" data-id="${p.id}">
                ${p.oferta ? '<span class="product-badge">OFERTA</span>' : ''}
                <div class="product-img-container">
                    <img src="${p.image || 'https://images.unsplash.com/photo-1588702547919-26089e690ecc?auto=format&fit=crop&w=500&q=60'}" alt="${p.name}" loading="lazy" onload="this.classList.add('loaded')" onerror="this.src='https://images.unsplash.com/photo-1588702547919-26089e690ecc?auto=format&fit=crop&w=500&q=60';">
                    ${!p.image ? '<div class="no-image-overlay">Sin Foto</div>' : ''}
                </div>
                <div class="product-content">
                    <h3 class="product-title">${p.name}</h3>
                    <div class="product-price ${p.oferta ? 'oferta' : ''}" style="margin: 0.5rem 0;">${formatMoney(p.price)}</div>
                    <button class="btn btn-whatsapp mt-4 w-100" data-product="${p.name}">
                        <i class="ph ph-whatsapp-logo"></i> Consultar
                    </button>
                </div>
            </div>
        `).join('');
    },

    _attachProductEvents() {
        document.querySelectorAll('.btn-whatsapp[data-product]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                WA.openProduct(e.target.closest('button').dataset.product);
            });
        });
    },

    renderServicesPublic() {
        const services = DB.get('services');
        this.app.innerHTML = `
            <div style="max-width: 1000px; margin: 0 auto;">
                <h1 style="text-align: center; margin-bottom: 2rem;">Nuestros Servicios Técnicos</h1>
                <div class="services-grid">
                    ${services.map(s => `
                        <div class="product-card glass" style="display: flex; flex-direction: column;">
                            <div style="font-size: 4rem; text-align: center; color: var(--accent-cyan); padding: 2rem 0 1rem 0;">
                                <i class="ph ${s.icon || 'ph-wrench'}"></i>
                            </div>
                            <div class="p-4" style="flex: 1; display: flex; flex-direction: column;">
                                <h3 class="product-title" style="text-align: center;">${s.name}</h3>
                                <p class="product-desc" style="text-align: center; flex: 1;">${s.desc}</p>
                                <button class="btn btn-whatsapp w-100 mt-4" onclick="WA.openService('${s.name}')">
                                    <i class="ph ph-whatsapp-logo"></i> Consultar
                                </button>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    },

    renderRepairsPublic() {
        this.app.innerHTML = `
            <div style="max-width: 520px; margin: 0 auto; text-align: center;">
                <h1>Consulta de Reparaciones</h1>
                <p style="color: var(--text-muted); margin-bottom: 2rem;">Ingresá tu clave de 5 dígitos para verificar el estado de tu equipo.</p>
                
                <div class="glass" style="padding: 2rem; border-radius: 1rem;">
                    <div class="form-group">
                        <input type="text" id="repair-search" class="form-control" placeholder="Ej: A8K2L" maxlength="5" style="text-align: center; font-size: 2rem; letter-spacing: 0.5rem; font-weight: 700; text-transform: uppercase;">
                    </div>
                    <button class="btn btn-primary" id="btn-search-repair" style="width: 100%;"><i class="ph ph-magnifying-glass"></i> Consultar Estado</button>
                </div>

                <div id="repair-result" style="margin-top: 2rem;"></div>
            </div>
        `;

        document.getElementById('btn-search-repair').addEventListener('click', () => {
            const query = document.getElementById('repair-search').value.trim();
            const repairs = DB.get('repairs');
            const clients = DB.get('clients');
            const repair = repairs.find(r => r.code === query.toUpperCase());
            const resultDiv = document.getElementById('repair-result');

            if (repair) {
                const client = clients.find(c => c.id === repair.clientId) || {};
                const statusClass = `status-${repair.status.replace(/\s+/g, '')}`;
                resultDiv.innerHTML = `
                    <div class="glass" style="padding: 1.5rem; border-radius: 1rem; text-align: left;">
                        <div style="background: var(--accent-blue); color: white; padding: 1rem; border-radius: 0.5rem; text-align: center; margin-bottom: 1.5rem;">
                            <div style="font-size: 0.8rem; opacity: 0.85;">CLAVE DE ORDEN</div>
                            <div style="font-size: 2.5rem; font-weight: 900; letter-spacing: 0.5rem;">${repair.code}</div>
                        </div>
                        <div class="flex justify-between items-center mb-4" style="margin-bottom: 1rem;">
                            <span style="color: var(--text-muted); font-size: 0.85rem;">Orden Interna: ${repair.id}</span>
                            <span class="status-badge ${statusClass}">${repair.status}</span>
                        </div>
                        <table style="width: 100%; border-collapse: collapse; font-size: 0.95rem;">
                            <tr><td style="padding: 0.5rem 0; color: var(--text-muted); width: 40%;">Cliente</td><td style="font-weight: 600;">${client.name || 'N/A'}</td></tr>
                            <tr><td style="padding: 0.5rem 0; color: var(--text-muted);">Equipo</td><td style="font-weight: 600;">${repair.equipment}</td></tr>
                            <tr><td style="padding: 0.5rem 0; color: var(--text-muted);">Problema</td><td>${repair.problem}</td></tr>
                            <tr><td style="padding: 0.5rem 0; color: var(--text-muted);">Fecha Ingreso</td><td>${repair.date}</td></tr>
                            ${repair.notes ? `<tr><td style="padding: 0.5rem 0; color: var(--text-muted);">Notas</td><td>${repair.notes}</td></tr>` : ''}
                        </table>
                        <button class="btn btn-secondary" onclick="Pages.printRepairPDF('${repair.code}')" style="width: 100%; margin-top: 1.5rem;">
                            <i class="ph ph-printer"></i> Imprimir / Guardar como PDF
                        </button>
                    </div>
                `;
            } else {
                resultDiv.innerHTML = `
                    <div class="glass" style="padding: 1.5rem; border-radius: 1rem; color: var(--danger); text-align: center;">
                        <i class="ph ph-warning" style="font-size: 2rem; display: block; margin-bottom: 0.5rem;"></i>
                        No se encontró ninguna orden con esa clave.
                    </div>
                `;
            }
        });

        // Permitir buscar presionando Enter
        document.getElementById('repair-search').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') document.getElementById('btn-search-repair').click();
        });
    },

    printRepairPDF(code) {
        const repairs = DB.get('repairs');
        const clients = DB.get('clients');
        const config = DB.getConfig();
        const repair = repairs.find(r => r.code === code);
        if (!repair) return;
        const client = clients.find(c => c.id === repair.clientId) || {};

        const printWin = window.open('', '_blank');
        printWin.document.write(`
        <!DOCTYPE html>
        <html lang="es">
        <head>
            <meta charset="UTF-8">
            <title>Comprobante de Reparación - ${repair.code}</title>
            <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap" rel="stylesheet">
            <style>
                :root {
                    --primary: #dc2626;
                    --dark: #111827;
                    --gray-50: #f9fafb;
                    --gray-100: #f3f4f6;
                    --gray-200: #e5e7eb;
                    --gray-500: #6b7280;
                    --gray-700: #374151;
                }
                * { box-sizing: border-box; margin: 0; padding: 0; }
                body { 
                    font-family: 'Inter', -apple-system, sans-serif; 
                    padding: 0; 
                    color: var(--dark); 
                    line-height: 1.5;
                    background: white;
                }
                .page {
                    width: 210mm;
                    padding: 15mm;
                    margin: auto;
                    background: white;
                    position: relative;
                }
                @page { size: A4; margin: 0; }
                .header { 
                    display: flex; 
                    justify-content: space-between; 
                    align-items: flex-start; 
                    border-bottom: 2px solid var(--primary); 
                    padding-bottom: 1rem; 
                    margin-bottom: 1.5rem; 
                }
                .company-name { 
                    font-size: 1.75rem; 
                    font-weight: 800; 
                    color: var(--primary); 
                    text-transform: uppercase;
                    letter-spacing: -0.025em;
                }
                .company-info { font-size: 0.85rem; color: var(--gray-500); margin-top: 0.2rem; font-weight: 500; }
                
                .order-header {
                    display: flex;
                    justify-content: space-between;
                    background: var(--gray-50);
                    padding: 1rem;
                    border-radius: 0.75rem;
                    margin-bottom: 1.5rem;
                    border: 1px solid var(--gray-100);
                }
                
                .code-section {
                    text-align: center;
                    flex: 1;
                }
                .badge-label { 
                    font-size: 0.7rem; 
                    color: var(--gray-500); 
                    font-weight: 700;
                    text-transform: uppercase;
                    letter-spacing: 0.1em;
                    margin-bottom: 0.4rem;
                }
                .badge-code { 
                    background: var(--primary); 
                    color: white; 
                    padding: 0.5rem 1.5rem; 
                    border-radius: 0.75rem; 
                    font-size: 4rem; 
                    font-weight: 800; 
                    letter-spacing: 0.4rem; 
                    display: inline-block;
                    line-height: 1;
                }

                .order-meta {
                    text-align: right;
                    display: flex;
                    flex-direction: column;
                    justify-content: center;
                    gap: 0.25rem;
                }
                .meta-item { font-size: 0.85rem; color: var(--gray-500); }
                .meta-item strong { color: var(--dark); font-weight: 700; }

                section { margin-bottom: 1.25rem; }
                h2 { 
                    color: var(--dark); 
                    font-size: 1rem; 
                    font-weight: 700;
                    text-transform: uppercase; 
                    letter-spacing: 0.05em; 
                    margin-bottom: 0.75rem; 
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                }
                h2::after {
                    content: "";
                    flex: 1;
                    height: 1px;
                    background: var(--gray-200);
                }

                .info-grid {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 1.5rem;
                }
                
                table { width: 100%; border-collapse: collapse; }
                td { padding: 0.5rem 0; border-bottom: 1px solid var(--gray-100); font-size: 0.9rem; }
                td:first-child { color: var(--gray-500); width: 35%; font-weight: 500; }
                td:last-child { font-weight: 600; color: var(--gray-700); }
                
                .notes-box {
                    background: var(--gray-50);
                    padding: 0.75rem;
                    border-radius: 0.5rem;
                    border-left: 4px solid var(--primary);
                    font-size: 0.85rem;
                    margin-top: 0.25rem;
                    min-height: 50px;
                }

                .footer { 
                    margin-top: 0.75rem; 
                    text-align: center; 
                    color: var(--gray-500); 
                    font-size: 0.75rem; 
                    border-top: 1px solid var(--gray-100); 
                    padding-top: 0.5rem; 
                }
                .footer p { margin-bottom: 0.1rem; }
                
                .stamp {
                    position: absolute;
                    bottom: 100px;
                    right: 80px;
                    width: 150px;
                    height: 150px;
                    border: 4px double var(--primary);
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    color: var(--primary);
                    font-weight: 800;
                    opacity: 0.15;
                    transform: rotate(-15deg);
                    font-size: 1.2rem;
                    text-align: center;
                    pointer-events: none;
                }

                @media print { 
                    body { background: white; }
                    .page { width: 100%; height: 100%; padding: 10mm; margin: 0; }
                    .badge-code { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                }
            </style>
        </head>
        <body>
            <div class="page">
                <div class="header">
                    <div>
                        <div class="company-name">${config.companyName}</div>
                        <div class="company-info">${config.address}</div>
                        <div class="company-info">${config.phone} • ${config.email}</div>
                    </div>
                    <div style="text-align: right;">
                        <div style="font-size: 1.5rem; font-weight: 800; color: var(--gray-700);">ORDEN DE SERVICIO</div>
                        <div style="color: var(--primary); font-weight: 700;"># ${repair.id}</div>
                    </div>
                </div>

                <div class="order-header">
                    <div class="code-section">
                        <div class="badge-label">CLAVE PARA CONSULTA WEB</div>
                        <div class="badge-code">${repair.code}</div>
                        <div style="margin-top: 0.75rem; font-size: 0.85rem; color: var(--gray-500); font-weight: 600;">Use esta clave en nuestro sitio para ver el estado</div>
                    </div>
                </div>

                <div class="info-grid">
                    <section>
                        <h2>Datos del Cliente</h2>
                        <table>
                            <tr><td>Nombre</td><td>${client.name || 'N/A'}</td></tr>
                            <tr><td>Teléfono</td><td>${client.phone || 'N/A'}</td></tr>
                            <tr><td>Email</td><td>${client.email || 'N/A'}</td></tr>
                        </table>
                    </section>
                    <section>
                        <h2>Detalles del Equipo</h2>
                        <table>
                            <tr><td>Equipo</td><td>${repair.equipment}</td></tr>
                            <tr><td>Fecha Ingreso</td><td>${repair.date}</td></tr>
                            <tr><td>Estado Inicial</td><td>${repair.status}</td></tr>
                        </table>
                    </section>
                </div>

                <section>
                    <h2>Problema Reportado</h2>
                    <div class="notes-box">${repair.problem}</div>
                </section>

                ${repair.notes ? `
                <section>
                    <h2>Observaciones Adicionales</h2>
                    <div class="notes-box" style="border-left-color: var(--gray-500);">${repair.notes}</div>
                </section>
                ` : ''}

                <div class="stamp">ORDEN<br>RECIBIDA</div>

                <div class="footer">
                    <p>Conserve este comprobante para retirar su equipo. | ${new Date().toLocaleDateString('es-AR')} — ${config.companyName}</p>
                </div>
            </div>
            <script>
                window.onload = () => { 
                    setTimeout(() => {
                        window.print();
                        // Opcional: cerrar la ventana después de imprimir
                        // window.close();
                    }, 500);
                }
            <\/script>
        </body>
        </html>
        `);
        printWin.document.close();
    },

    renderLogin() {
        this.app.innerHTML = `
            <div style="max-width: 400px; margin: 4rem auto;">
                <div class="glass" style="padding: 2rem; border-radius: 1rem;">
                    <h2 class="text-center mb-4">Acceso Admin</h2>
                    <form id="login-form">
                        <div class="form-group">
                            <label class="form-label">Usuario</label>
                            <input type="text" id="username" class="form-control" required>
                        </div>
                        <div class="form-group">
                            <label class="form-label">Contraseña</label>
                            <input type="password" id="password" class="form-control" required>
                        </div>
                        <div id="login-error" style="color: var(--danger); margin-bottom: 1rem; display: none;">Credenciales incorrectas</div>
                        <button type="submit" class="btn btn-primary" style="width: 100%;">Ingresar</button>
                    </form>
                </div>
            </div>
        `;

        document.getElementById('login-form').addEventListener('submit', (e) => {
            e.preventDefault();
            const u = document.getElementById('username').value;
            const p = document.getElementById('password').value;
            if (Auth.login(u, p)) {
                Router.navigate('/admin');
            } else {
                document.getElementById('login-error').style.display = 'block';
            }
        });
    },

    async renderDashboard() {
        const products = DB.get('products');
        const clients = DB.get('clients');
        const repairs = DB.get('repairs');
        const activeRepairs = repairs.filter(r => r.status !== 'Entregada');
        const deliveredRepairs = repairs.filter(r => r.status === 'Entregada');

        this.app.innerHTML = `
            <h1>Dashboard</h1>
            <div class="dashboard-grid">
                <div class="stat-card glass">
                    <div class="stat-icon blue"><i class="ph ph-package"></i></div>
                    <div class="stat-info">
                        <h3>${products.length}</h3>
                        <p>Productos en Catálogo</p>
                    </div>
                </div>
                <div class="stat-card glass">
                    <div class="stat-icon cyan"><i class="ph ph-users"></i></div>
                    <div class="stat-info">
                        <h3>${clients.length}</h3>
                        <p>Clientes Registrados</p>
                    </div>
                </div>
                <div class="stat-card glass">
                    <div class="stat-icon green"><i class="ph ph-wrench"></i></div>
                    <div class="stat-info">
                        <h3>${activeRepairs.length}</h3>
                        <p>Reparaciones Activas</p>
                    </div>
                </div>
                <div class="stat-card glass" onclick="Router.navigate('/admin/config')" style="cursor: pointer;">
                    <div class="stat-icon blue"><i class="ph ph-chart-line-up"></i></div>
                    <div class="stat-info">
                        <h3 id="dash-visits-count"><i class="ph ph-spinner-gap anim-spin"></i></h3>
                        <p>Visitas Totales</p>
                    </div>
                </div>
            </div>

            <!-- Sección Dividida: Reparaciones Activas -->
            <div style="margin-top: 2rem; margin-bottom: 2rem;">
                <h2 style="display: flex; align-items: center; gap: 0.5rem;"><i class="ph ph-wrench" style="color: var(--accent-blue);"></i> Reparaciones Activas</h2>
                <div class="table-container glass">
                    <table>
                        <thead>
                            <tr>
                                <th>N° Orden</th>
                                <th>Cliente</th>
                                <th>Equipo</th>
                                <th>Estado</th>
                                <th>Fecha de Recepción</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${activeRepairs.length === 0 
                                ? '<tr><td colspan="5" class="text-center" style="color: var(--text-muted); padding: 1.5rem;">No hay reparaciones activas</td></tr>' 
                                : activeRepairs.slice().reverse().map(r => {
                                    const client = clients.find(c => c.id === r.clientId) || {name: 'Desconocido'};
                                    const statusClass = `status-${r.status.replace(/\s+/g, '')}`;
                                    return `
                                        <tr>
                                            <td><strong>${r.id}</strong></td>
                                            <td>${client.name}</td>
                                            <td>${r.equipment}</td>
                                            <td><span class="status-badge ${statusClass}">${r.status}</span></td>
                                            <td>${r.date}</td>
                                        </tr>
                                    `;
                                }).join('')}
                        </tbody>
                    </table>
                </div>
            </div>

            <!-- Sección Dividida: Reparaciones Entregadas e Historial con Buscador -->
            <div style="margin-top: 2.5rem;">
                <div class="flex justify-between items-center mb-4" style="flex-wrap: wrap; gap: 1rem;">
                    <h2 style="margin: 0; display: flex; align-items: center; gap: 0.5rem;"><i class="ph ph-archive" style="color: var(--success);"></i> Historial de Reparaciones Entregadas</h2>
                    <div style="position: relative;">
                        <i class="ph ph-magnifying-glass" style="position: absolute; left: 0.75rem; top: 50%; transform: translateY(-50%); color: var(--text-muted);"></i>
                        <input type="text" id="search-delivered" class="form-control" placeholder="Buscar en entregadas..." style="padding-left: 2.2rem; width: 250px;">
                    </div>
                </div>
                
                <div class="table-container glass">
                    <table>
                        <thead>
                            <tr>
                                <th>N° Orden</th>
                                <th>Cliente</th>
                                <th>Equipo</th>
                                <th>Estado</th>
                                <th>Fecha de Entrega</th>
                            </tr>
                        </thead>
                        <tbody id="delivered-repairs-tbody">
                            ${deliveredRepairs.length === 0 
                                ? '<tr><td colspan="5" class="text-center" style="color: var(--text-muted); padding: 1.5rem;">No hay reparaciones entregadas</td></tr>' 
                                : deliveredRepairs.slice().reverse().map(r => {
                                    const client = clients.find(c => c.id === r.clientId) || {name: 'Desconocido'};
                                    const statusClass = `status-${r.status.replace(/\s+/g, '')}`;
                                    return `
                                        <tr class="delivered-row">
                                            <td><strong>${r.id}</strong></td>
                                            <td>${client.name}</td>
                                            <td>${r.equipment}</td>
                                            <td><span class="status-badge ${statusClass}">${r.status}</span></td>
                                            <td>${r.date}</td>
                                        </tr>
                                    `;
                                }).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;

        // Real-time multi-word search for delivered repairs
        const searchInput = document.getElementById('search-delivered');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                const q = e.target.value.trim().toLowerCase();
                const queryWords = q ? q.split(/\s+/) : [];
                document.querySelectorAll('.delivered-row').forEach(row => {
                    if (queryWords.length === 0) {
                        row.style.display = '';
                        return;
                    }
                    const content = row.textContent.toLowerCase();
                    row.style.display = queryWords.every(word => content.includes(word)) ? '' : 'none';
                });
            });
        }

        // Cargar las visitas de forma asíncrona
        try {
            const hits = await Stats.getHits();
            const visitsEl = document.getElementById('dash-visits-count');
            if (visitsEl) visitsEl.textContent = hits;
        } catch (e) {
            const visitsEl = document.getElementById('dash-visits-count');
            if (visitsEl) visitsEl.textContent = '—';
        }
    },

    renderProductsAdmin(preserveScroll = false) {
        const scrollY = window.scrollY;
        const products = DB.get('products');
        this.app.innerHTML = `
            <div id="admin-status-bar" class="admin-status-bar"></div>
            <div class="p-4">
                <div class="flex justify-between items-center mb-4" style="flex-wrap: wrap; gap: 1rem;">
                    <h1 style="margin-bottom: 0;">Gestión de Productos</h1>
                <div style="display: flex; gap: 0.75rem; flex-wrap: wrap; align-items: center;">
                    <!-- Button Sync WhatsApp Deshabilitado 
                    <button class="btn btn-secondary" id="btn-sync-catalog-shortcut" title="Sincronizar con WhatsApp / GitHub">
                        <i class="ph ph-whatsapp-logo"></i> Sync WhatsApp
                    </button>
                    -->
                    <div style="position: relative;">
                        <i class="ph ph-magnifying-glass" style="position: absolute; left: 0.75rem; top: 50%; transform: translateY(-50%); color: var(--text-muted);"></i>
                        <input type="text" id="search-products" class="form-control" placeholder="Buscar producto..." style="padding-left: 2.2rem; width: 220px;">
                    </div>
                    <button class="btn btn-secondary" id="btn-manage-categories"><i class="ph ph-tag"></i> Categorías</button>
                    <button class="btn btn-secondary" id="btn-bulk-price"><i class="ph ph-trend-up"></i> Incremento</button>
                    <button class="btn btn-secondary" id="btn-import-products"><i class="ph ph-file-arrow-up"></i> Importar</button>
                    <button class="btn btn-primary" id="btn-add-product"><i class="ph ph-plus"></i> Nuevo Producto</button>
                </div>
            </div>
            
            <div class="table-container glass">
                <table>
                    <thead>
                        <tr>
                            <th>Imagen</th>
                            <th>Nombre</th>
                            <th>Categoría</th>
                            <th>Precio</th>
                            <th>Oferta</th>
                            <th>Acciones</th>
                        </tr>
                    </thead>
                    <tbody id="admin-products-tbody">
                        ${products.map(p => `
                            <tr>
                                <td><img src="${p.image || 'https://via.placeholder.com/50x50?text=S/F'}" alt="" style="width: 40px; height: 40px; object-fit: cover; border-radius: 4px;"></td>
                                <td>${p.name}</td>
                                <td>${p.category}</td>
                                <td>${formatMoney(p.price)}</td>
                                <td>${p.oferta ? '<span class="status-badge status-Finalizada">Sí</span>' : '-'}</td>
                                <td>
                                    <button class="btn btn-secondary btn-edit" data-id="${p.id}"><i class="ph ph-pencil"></i></button>
                                    <button class="btn btn-danger btn-delete" data-id="${p.id}"><i class="ph ph-trash"></i></button>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        </div>
        `;

        document.getElementById('btn-add-product').addEventListener('click', () => this.showProductModal());

        // Shortcut Sync Button
        /* Shortcut Sync Button Deshabilitado
        document.getElementById('btn-sync-catalog-shortcut').addEventListener('click', async () => {
            // ...
        });
        */
        document.getElementById('btn-manage-categories').addEventListener('click', () => this.showCategoryModal());
        document.getElementById('btn-bulk-price').addEventListener('click', () => this.showBulkPriceModal());
        document.getElementById('btn-import-products').addEventListener('click', () => this.showImportModal());
        
        // Buscador en tiempo real
        document.getElementById('search-products').addEventListener('input', (e) => {
            const q = e.target.value.trim().toLowerCase();
            const queryWords = q ? q.split(/\s+/) : [];
            document.querySelectorAll('#admin-products-tbody tr').forEach(row => {
                if (queryWords.length === 0) {
                    row.style.display = '';
                    return;
                }
                const content = row.textContent.toLowerCase();
                row.style.display = queryWords.every(word => content.includes(word)) ? '' : 'none';
            });
        });
        
        document.querySelectorAll('.btn-edit').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = e.target.closest('button').dataset.id;
                this.showProductModal(products.find(p => p.id === id));
            });
        });

        document.querySelectorAll('.btn-delete').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = e.target.closest('button').dataset.id;
                if(confirm('¿Eliminar este producto?')) {
                    DB.delete('products', id);
                    this.renderProductsAdmin(true);
                }
            });
        });

        // Doble clic para editar
        document.querySelectorAll('#admin-products-tbody tr').forEach(row => {
            row.addEventListener('dblclick', () => {
                const id = row.querySelector('.btn-edit').dataset.id;
                this.showProductModal(products.find(p => p.id === id));
            });
        });

        StatusBar.update();
        if (preserveScroll) {
            window.scrollTo(0, scrollY);
        }
    },

    showProductModal(product = null) {
        const isEdit = !!product;
        const categories = DB.get('categories');
        Modal.open(`
            <div class="modal-header">
                <h3>${isEdit ? 'Editar Producto' : 'Nuevo Producto'}</h3>
                <button class="modal-close" onclick="Modal.close()"><i class="ph ph-x"></i></button>
            </div>
            <form id="product-form">
            <form id="product-form">
                <div class="form-grid">
                    <div class="form-group">
                        <label class="form-label">Imagen del Producto</label>
                        <div id="image-drop-zone" class="drop-zone ${isEdit && product.image ? 'drop-zone--has-image' : ''}" style="height: 180px;">
                            <img src="${isEdit ? product.image : ''}" class="drop-zone-preview">
                            <div class="drop-zone-prompt">
                                <i class="ph ph-image-plus drop-zone-icon"></i>
                                <span>Arrastra o haz clic</span>
                            </div>
                            <input type="file" id="p-file" accept="image/*" style="display: none;">
                        </div>
                        <input type="text" id="p-image" class="form-control mt-4" value="${isEdit ? (product.image || '') : ''}" placeholder="URL o ruta de imagen">
                    </div>
                    <div>
                        <div class="form-group">
                            <label class="form-label">Nombre</label>
                            <input type="text" id="p-name" class="form-control" value="${isEdit ? product.name : ''}" required>
                        </div>
                        <div class="flex gap-2">
                            <div class="form-group" style="flex:1;">
                                <label class="form-label">Categoría</label>
                                <select id="p-category" class="form-control" required>
                                    ${categories.map(cat => `<option value="${cat.name}" ${isEdit && product.category === cat.name ? 'selected' : ''}>${cat.name}</option>`).join('')}
                                </select>
                            </div>
                            <div class="form-group" style="flex:1;">
                                <label class="form-label">Precio ($)</label>
                                <input type="number" id="p-price" class="form-control" value="${isEdit ? product.price : ''}" required>
                            </div>
                        </div>
                        <div class="form-group">
                            <label class="form-label">Descripción</label>
                            <textarea id="p-desc" class="form-control" style="height: 80px;">${isEdit ? (product.desc || '') : ''}</textarea>
                        </div>
                        <div class="form-group flex items-center gap-2">
                            <input type="checkbox" id="p-oferta" ${isEdit && product.oferta ? 'checked' : ''}>
                            <label for="p-oferta" class="form-label" style="margin:0;">Destacar en Ofertas</label>
                        </div>
                    </div>
                </div>
                <button type="submit" class="btn btn-primary w-100" style="width:100%;">${isEdit ? 'Guardar Cambios' : 'Crear Producto'}</button>
            </form>
        `);

        const dropZone = document.getElementById('image-drop-zone');
        const fileInput = document.getElementById('p-file');
        const urlInput = document.getElementById('p-image');
        const previewImg = dropZone.querySelector('.drop-zone-preview');

        const handleFile = (file) => {
            if (file && file.type.startsWith('image/')) {
                const reader = new FileReader();
                reader.onload = (e) => {
                    const base64 = e.target.result;
                    urlInput.value = base64;
                    previewImg.src = base64;
                    dropZone.classList.add('drop-zone--has-image');
                };
                reader.readAsDataURL(file);
            }
        };

        dropZone.addEventListener('click', () => fileInput.click());

        fileInput.addEventListener('change', () => {
            if (fileInput.files.length) handleFile(fileInput.files[0]);
        });

        dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropZone.classList.add('drop-zone--over');
        });

        ['dragleave', 'dragend'].forEach(type => {
            dropZone.addEventListener(type, () => {
                dropZone.classList.remove('drop-zone--over');
            });
        });

        dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropZone.classList.remove('drop-zone--over');
            if (e.dataTransfer.files.length) {
                handleFile(e.dataTransfer.files[0]);
            }
        });

        // Al cambiar la URL manualmente, actualizar la preview
        urlInput.addEventListener('input', () => {
            if (urlInput.value) {
                previewImg.src = urlInput.value;
                dropZone.classList.add('drop-zone--has-image');
            } else {
                dropZone.classList.remove('drop-zone--has-image');
            }
        });

        document.getElementById('product-form').addEventListener('submit', (e) => {
            e.preventDefault();
            const data = {
                name: document.getElementById('p-name').value,
                category: document.getElementById('p-category').value,
                price: parseFloat(document.getElementById('p-price').value),
                desc: document.getElementById('p-desc').value,
                image: document.getElementById('p-image').value,
                oferta: document.getElementById('p-oferta').checked
            };

            if (isEdit) {
                DB.update('products', product.id, data);
            } else {
                DB.add('products', data);
            }
            Modal.close();
            this.renderProductsAdmin(isEdit);
        });
    },

    showBulkPriceModal() {
        const categories = DB.get('categories');
        Modal.open(`
            <div class="modal-header">
                <h3>Incremento Masivo de Precios</h3>
                <button class="modal-close" onclick="Modal.close()"><i class="ph ph-x"></i></button>
            </div>
            <div class="alert alert-info mb-4" style="background: rgba(59, 130, 246, 0.1); padding: 1rem; border-radius: 0.5rem; font-size: 0.85rem; color: var(--text-main); border: 1px solid rgba(59, 130, 246, 0.2);">
                <i class="ph ph-info"></i> Esta acción aplicará un aumento porcentual a todos los productos o a la categoría seleccionada.
            </div>
            <form id="bulk-price-form">
                <div class="form-group">
                    <label class="form-label">Categoría a afectar</label>
                    <select id="bulk-category" class="form-control" required>
                        <option value="all">Todas las categorías</option>
                        ${categories.map(cat => `<option value="${cat.name}">${cat.name}</option>`).join('')}
                    </select>
                </div>
                <div class="form-grid">
                    <div class="form-group">
                        <label class="form-label">Porcentaje de aumento (%)</label>
                        <input type="number" id="bulk-percentage" class="form-control" placeholder="Ej: 10" step="0.1" required min="0">
                    </div>
                    <div class="form-group">
                        <label class="form-label">Redondeo</label>
                        <select id="bulk-rounding" class="form-control">
                            <option value="0">Sin redondeo especial</option>
                            <option value="500">Al 500 más cercano</option>
                            <option value="1000" selected>Al 1000 más cercano</option>
                        </select>
                    </div>
                </div>
                <div class="form-group flex items-center gap-2 mb-4">
                    <input type="checkbox" id="bulk-update-old" checked>
                    <label for="bulk-update-old" class="form-label" style="margin:0;">Actualizar también precios de oferta (Precio Viejo)</label>
                </div>
                <button type="submit" class="btn btn-primary w-100" style="width: 100%;"><i class="ph ph-check-circle"></i> Aplicar Incremento</button>
            </form>
        `);

        document.getElementById('bulk-price-form').addEventListener('submit', (e) => {
            e.preventDefault();
            const category = document.getElementById('bulk-category').value;
            const percentage = parseFloat(document.getElementById('bulk-percentage').value);
            const rounding = parseInt(document.getElementById('bulk-rounding').value);
            const updateOld = document.getElementById('bulk-update-old').checked;

            if (isNaN(percentage) || percentage < 0) {
                alert('Ingrese un porcentaje válido.');
                return;
            }

            const products = DB.get('products');
            let count = 0;

            const roundPrice = (p, r) => {
                if (r === 500) return Math.round(p / 500) * 500;
                if (r === 1000) return Math.round(p / 1000) * 1000;
                return Math.round(p);
            };

            const updatedProducts = products.map(p => {
                if (category === 'all' || p.category === category) {
                    const newPrice = roundPrice(p.price * (1 + percentage / 100), rounding);
                    let update = { price: newPrice };
                    
                    if (updateOld && p.oldPrice) {
                        update.oldPrice = roundPrice(p.oldPrice * (1 + percentage / 100), rounding);
                    }
                    
                    count++;
                    return { ...p, ...update };
                }
                return p;
            });

            if (count === 0) {
                alert('No se encontraron productos en la categoría seleccionada.');
                return;
            }

            if (confirm(`Se incrementarán los precios de ${count} productos en un ${percentage}%. ¿Continuar?`)) {
                DB.set('products', updatedProducts);
                Modal.close();
                this.renderProductsAdmin(true);
                Toast.show(`Se actualizaron ${count} productos`, 'success');
            }
        });
    },

    showImportModal() {
        const categories = DB.get('categories');
        Modal.open(`
            <div class="modal-header">
                <h3>Importación Masiva de Productos</h3>
                <button class="modal-close" onclick="Modal.close()"><i class="ph ph-x"></i></button>
            </div>
            <div class="alert alert-info mb-4" style="background: rgba(59, 130, 246, 0.1); padding: 1rem; border-radius: 0.5rem; font-size: 0.85rem; color: var(--text-main); border: 1px solid rgba(59, 130, 246, 0.2);">
                <i class="ph ph-info"></i> Pegue los nombres en la columna izquierda y los precios en la derecha (uno por línea). Asegúrese de que coincidan en cantidad.
            </div>
            <form id="import-form">
                <div class="form-group">
                    <label class="form-label">Categoría de destino</label>
                    <select id="import-category" class="form-control" required>
                        ${categories.map(cat => `<option value="${cat.name}">${cat.name}</option>`).join('')}
                    </select>
                </div>
                <div class="form-grid">
                    <div class="form-group">
                        <label class="form-label">Nombres de Producto</label>
                        <textarea id="import-names" class="form-control" placeholder="Producto A\nProducto B\n..." style="height: 180px; font-family: monospace; white-space: pre; overflow-wrap: normal;" required></textarea>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Precios ($)</label>
                        <textarea id="import-prices" class="form-control" placeholder="15000\n25000\n..." style="height: 180px; font-family: monospace; white-space: pre; overflow-wrap: normal;" required></textarea>
                    </div>
                </div>
                <div id="import-status" style="margin-bottom: 1rem; font-size: 0.85rem;"></div>
                <button type="submit" class="btn btn-primary w-100" style="width: 100%;"><i class="ph ph-check-circle"></i> Cerrar y Guardar</button>
            </form>
        `);

        const namesArea = document.getElementById('import-names');
        const pricesArea = document.getElementById('import-prices');
        const statusDiv = document.getElementById('import-status');

        const updateStatus = () => {
            const names = namesArea.value.split('\n').filter(l => l.trim() !== '');
            const prices = pricesArea.value.split('\n').filter(l => l.trim() !== '');
            if (names.length === 0 && prices.length === 0) {
                statusDiv.innerHTML = '';
            } else if (names.length === prices.length) {
                statusDiv.innerHTML = `<span style="color: var(--success);"><i class="ph ph-check-circle"></i> Se detectaron ${names.length} productos listos para importar.</span>`;
            } else {
                statusDiv.innerHTML = `<span style="color: var(--danger);"><i class="ph ph-warning"></i> Las columnas no coinciden (${names.length} nombres vs ${prices.length} precios).</span>`;
            }
        };

        namesArea.addEventListener('input', updateStatus);
        pricesArea.addEventListener('input', updateStatus);

        document.getElementById('import-form').addEventListener('submit', (e) => {
            e.preventDefault();
            const names = namesArea.value.split('\n').map(l => l.trim()).filter(l => l !== '');
            const prices = pricesArea.value.split('\n').map(l => l.trim()).filter(l => l !== '');
            const category = document.getElementById('import-category').value;

            if (names.length !== prices.length) {
                alert('La cantidad de nombres y precios debe coincidir.');
                return;
            }

            if (names.length === 0) {
                alert('No hay datos para importar.');
                return;
            }

            if (!confirm(`¿Está seguro de importar ${names.length} productos a la categoría "${category}"?`)) {
                return;
            }

            let count = 0;
            names.forEach((name, i) => {
                const price = parseFloat(prices[i].replace(/[^\d.-]/g, ''));
                if (!isNaN(price)) {
                    DB.add('products', {
                        name: name,
                        category: category,
                        price: price,
                        desc: 'Importado masivamente',
                        image: 'https://images.unsplash.com/photo-1588702547919-26089e690ecc?auto=format&fit=crop&w=500&q=60',
                        oferta: false
                    }, false); // No sincronizar todavía
                    count++;
                }
            });

            DB.syncToServer(); // Sincronizar una sola vez al final
            Modal.close();
            this.renderProductsAdmin(true);
        });
    },

    showCategoryModal() {
        const categories = DB.get('categories');
        Modal.open(`
            <div class="modal-header">
                <h3>Gestionar Categorías</h3>
                <button class="modal-close" onclick="Modal.close()"><i class="ph ph-x"></i></button>
            </div>
            <div class="form-group">
                <label class="form-label">Nueva Categoría</label>
                <div class="flex gap-2">
                    <input type="text" id="new-cat-name" class="form-control" placeholder="Ej: Tablets">
                    <button class="btn btn-primary" id="btn-save-cat"><i class="ph ph-plus"></i></button>
                </div>
            </div>
            <div class="table-container glass" style="max-height: 300px; overflow-y: auto; margin-bottom: 1.5rem;">
                <table style="width: 100%;">
                    <thead>
                        <tr>
                            <th>Nombre</th>
                            <th style="text-align: right;">Acciones</th>
                        </tr>
                    </thead>
                    <tbody id="categories-tbody">
                        ${categories.map(cat => `
                            <tr>
                                <td style="padding: 0.5rem;">${cat.name}</td>
                                <td style="text-align: right; padding: 0.5rem;">
                                    <button class="btn btn-danger btn-sm btn-delete-cat" data-id="${cat.id}"><i class="ph ph-trash"></i></button>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
            <div class="modal-footer" style="display: flex; justify-content: flex-end; gap: 1rem; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 1rem;">
                <button class="btn btn-primary w-100" id="btn-close-save-categories">
                    <i class="ph ph-check-circle"></i> Cerrar y Guardar
                </button>
            </div>
        `);

        document.getElementById('btn-save-cat').addEventListener('click', () => {
            const name = document.getElementById('new-cat-name').value.trim();
            if (name) {
                DB.add('categories', { name }, false);
                this.showCategoryModal(); // Refrescar modal
            }
        });

        document.querySelectorAll('.btn-delete-cat').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = e.target.closest('button').dataset.id;
                if (confirm('¿Eliminar esta categoría?')) {
                    DB.delete('categories', id, false);
                    this.showCategoryModal(); // Refrescar modal
                }
            });
        });

        document.getElementById('btn-close-save-categories').addEventListener('click', () => {
            DB.syncToServer(true); // Mostrar modal para sync manual final
        });
    },

    renderRepairsAdmin(showHistory = false) {
        const allRepairs = DB.get('repairs');
        const repairs = showHistory ? allRepairs : allRepairs.filter(r => r.status !== 'Entregada');
        const clients = DB.get('clients');

        this.app.innerHTML = `
            <div class="flex justify-between items-center mb-4" style="flex-wrap: wrap; gap: 1rem;">
                <h1 style="margin-bottom: 0;">Gestión de Reparaciones</h1>
                <div style="display: flex; gap: 0.75rem; flex-wrap: wrap; align-items: center;">
                    <div class="flex items-center gap-2 mr-4" style="background: rgba(0,0,0,0.05); padding: 0.5rem 1rem; border-radius: 2rem;">
                        <input type="checkbox" id="toggle-history" ${showHistory ? 'checked' : ''}>
                        <label for="toggle-history" style="font-size: 0.85rem; cursor: pointer; margin: 0;">Ver Historial</label>
                    </div>
                    <div style="position: relative;">
                        <i class="ph ph-magnifying-glass" style="position: absolute; left: 0.75rem; top: 50%; transform: translateY(-50%); color: var(--text-muted);"></i>
                        <input type="text" id="search-repairs" class="form-control" placeholder="Buscar reparación..." style="padding-left: 2.2rem; width: 220px;">
                    </div>
                    <button class="btn btn-primary" id="btn-add-repair"><i class="ph ph-plus"></i> Nueva Orden</button>
                </div>
            </div>
            
            <div class="table-container glass">
                <table>
                    <thead>
                        <tr>
                            <th>N° Orden</th>
                            <th>Clave</th>
                            <th>Cliente</th>
                            <th>Equipo</th>
                            <th>Estado</th>
                            <th>Fecha</th>
                            <th>Acciones</th>
                        </tr>
                    </thead>
                    <tbody id="admin-repairs-tbody">
                        ${repairs.map(r => {
                            const client = clients.find(c => c.id === r.clientId) || {name: 'Desconocido'};
                            const statusClass = `status-${r.status.replace(/\s+/g, '')}`;
                            return `
                            <tr>
                                <td><strong>${r.id}</strong></td>
                                <td><span style="font-size: 1.1rem; font-weight: 700; letter-spacing: 0.2rem; color: var(--accent-blue);">${r.code || '—'}</span></td>
                                <td>${client.name}</td>
                                <td>${r.equipment}</td>
                                <td><span class="status-badge ${statusClass}">${r.status}</span></td>
                                <td>${r.date}</td>
                                <td>
                                    <button class="btn btn-secondary btn-edit" data-id="${r.id}"><i class="ph ph-pencil"></i></button>
                                    <button class="btn btn-secondary btn-pdf" data-code="${r.code}" title="Imprimir comprobante"><i class="ph ph-printer"></i></button>
                                    <button class="btn btn-danger btn-delete-repair" data-id="${r.id}"><i class="ph ph-trash"></i></button>
                                </td>
                            </tr>
                        `}).join('')}
                    </tbody>
                </table>
            </div>
        `;

        document.getElementById('btn-add-repair').addEventListener('click', () => this.showRepairModal());
        

        
        document.getElementById('toggle-history').addEventListener('change', (e) => {
            this.renderRepairsAdmin(e.target.checked);
        });
        
        // Buscador en tiempo real
        document.getElementById('search-repairs').addEventListener('input', (e) => {
            const q = e.target.value.trim().toLowerCase();
            const queryWords = q ? q.split(/\s+/) : [];
            document.querySelectorAll('#admin-repairs-tbody tr').forEach(row => {
                if (queryWords.length === 0) {
                    row.style.display = '';
                    return;
                }
                const content = row.textContent.toLowerCase();
                row.style.display = queryWords.every(word => content.includes(word)) ? '' : 'none';
            });
        });
        
        // Usar delegación de eventos para los botones de la tabla
        const tbody = document.getElementById('admin-repairs-tbody');
        if (tbody) {
            tbody.addEventListener('click', (e) => {
                const btnDelete = e.target.closest('.btn-delete-repair');
                const btnEdit = e.target.closest('.btn-edit');
                const btnPdf = e.target.closest('.btn-pdf');

                if (btnDelete) {
                    e.preventDefault();
                    e.stopPropagation();
                    const id = btnDelete.dataset.id;
                    if (window.confirm('¿Está seguro de eliminar esta orden de reparación?')) {
                        DB.delete('repairs', id);
                        const historyToggle = document.getElementById('toggle-history');
                        this.renderRepairsAdmin(historyToggle ? historyToggle.checked : false);
                    }
                } else if (btnPdf) {
                    e.preventDefault();
                    e.stopPropagation();
                    const code = btnPdf.dataset.code;
                    if (code) Pages.printRepairPDF(code);
                } else if (btnEdit) {
                    e.preventDefault();
                    e.stopPropagation();
                    const id = btnEdit.dataset.id;
                    this.showRepairModal(repairs.find(r => r.id === id));
                }
            });
        }

        // Eliminar los listeners individuales que ya no son necesarios
        /*
        document.querySelectorAll('.btn-edit').forEach(btn => { ... });
        document.querySelectorAll('.btn-pdf').forEach(btn => { ... });
        document.querySelectorAll('.btn-delete-repair').forEach(btn => { ... });
        */

        // Doble clic para editar
        document.querySelectorAll('#admin-repairs-tbody tr').forEach(row => {
            row.addEventListener('dblclick', () => {
                const id = row.querySelector('.btn-edit').dataset.id;
                this.showRepairModal(repairs.find(r => r.id === id));
            });
        });
    },

    showRepairModal(repair = null) {
        const isEdit = !!repair;
        const clients = DB.get('clients');
        const statuses = ['Recibida', 'En Diagnóstico', 'En Reparación', 'Esperando Repuestos', 'Finalizada', 'Entregada'];

        Modal.open(`
            <div class="modal-header">
                <h3>${isEdit ? 'Editar Orden: '+repair.id : 'Nueva Orden de Reparación'}</h3>
                <button class="modal-close" onclick="Modal.close()"><i class="ph ph-x"></i></button>
            </div>
            <form id="repair-form">
                <div class="form-grid">
                    <div>
                        ${!isEdit ? `
                            <div class="form-group">
                                <div class="flex justify-between items-center mb-2">
                                    <label class="form-label" style="margin: 0;">Cliente</label>
                                    <div class="client-mode-selector">
                                        <button type="button" id="btn-mode-search" class="active"><i class="ph ph-magnifying-glass"></i> Buscar</button>
                                        <button type="button" id="btn-mode-create"><i class="ph ph-plus"></i> Nuevo</button>
                                    </div>
                                </div>
                                
                                <!-- Modo 1: Buscar Existente -->
                                <div id="client-search-section" class="searchable-select-container">
                                    <div class="searchable-select-input-wrapper">
                                        <i class="ph ph-magnifying-glass searchable-select-search-icon"></i>
                                        <input type="text" id="r-client-search" class="form-control searchable-select-input" placeholder="Buscar cliente por nombre o teléfono..." autocomplete="off">
                                        <button type="button" id="btn-clear-client" class="searchable-select-clear d-none" title="Limpiar selección"><i class="ph ph-x"></i></button>
                                    </div>
                                    <input type="hidden" id="r-client">
                                    <div id="client-search-results" class="searchable-select-dropdown d-none glass"></div>
                                </div>

                                <!-- Modo 2: Crear Nuevo Cliente -->
                                <div id="client-create-section" class="d-none" style="background: rgba(220, 38, 38, 0.02); border: 1px dashed var(--glass-border); border-radius: 0.5rem; padding: 0.75rem; margin-top: 0.25rem;">
                                    <div class="quick-create-inputs">
                                        <input type="text" id="new-c-name" class="form-control mb-2" placeholder="Nombre completo del cliente nuevo">
                                        <input type="text" id="new-c-phone" class="form-control" placeholder="Teléfono (Obligatorio)">
                                    </div>
                                </div>
                            </div>
                        ` : ''}
                        
                        <div class="form-group">
                            <label class="form-label">Equipo</label>
                            <input type="text" id="r-equipment" class="form-control" value="${isEdit ? repair.equipment : ''}" required>
                        </div>
                        <div class="form-group">
                            <label class="form-label">Estado</label>
                            <select id="r-status" class="form-control" required>
                                ${statuses.map(s => `<option value="${s}" ${isEdit && repair.status===s ? 'selected' : ''}>${s}</option>`).join('')}
                            </select>
                        </div>
                    </div>
                    <div>
                        <div class="form-group">
                            <label class="form-label">Problema Reportado</label>
                            <textarea id="r-problem" class="form-control" style="height: 80px;" required>${isEdit ? repair.problem : ''}</textarea>
                        </div>
                        <div class="form-group">
                            <label class="form-label">Notas Adicionales</label>
                            <textarea id="r-notes" class="form-control" style="height: 80px;">${isEdit && repair.notes ? repair.notes : ''}</textarea>
                        </div>
                    </div>
                </div>
                <button type="submit" class="btn btn-primary w-100" style="width:100%;">${isEdit ? 'Actualizar Orden' : 'Crear Orden'}</button>
                ${isEdit ? `
                    <div style="border-top: 1px solid var(--glass-border); margin: 1rem 0;"></div>
                    <button type="button" id="btn-delete-repair-modal" class="btn btn-danger w-100">
                        <i class="ph ph-trash"></i> Eliminar Orden Permanentemente
                    </button>
                ` : ''}
            </form>
        `);

        if (!isEdit) {
            const searchInput = document.getElementById('r-client-search');
            const hiddenInput = document.getElementById('r-client');
            const clearBtn = document.getElementById('btn-clear-client');
            const dropdown = document.getElementById('client-search-results');
            const wrapper = searchInput.closest('.searchable-select-input-wrapper');

            const btnModeSearch = document.getElementById('btn-mode-search');
            const btnModeCreate = document.getElementById('btn-mode-create');
            const searchSection = document.getElementById('client-search-section');
            const createSection = document.getElementById('client-create-section');

            btnModeSearch.addEventListener('click', (e) => {
                e.preventDefault();
                btnModeSearch.classList.add('active');
                btnModeCreate.classList.remove('active');
                searchSection.classList.remove('d-none');
                createSection.classList.add('d-none');
            });

            btnModeCreate.addEventListener('click', (e) => {
                e.preventDefault();
                btnModeCreate.classList.add('active');
                btnModeSearch.classList.remove('active');
                searchSection.classList.add('d-none');
                createSection.classList.remove('d-none');
            });

            const escapeHtml = (str) => {
                return str
                    .replace(/&/g, "&amp;")
                    .replace(/</g, "&lt;")
                    .replace(/>/g, "&gt;")
                    .replace(/"/g, "&quot;")
                    .replace(/'/g, "&#039;");
            };

            const renderDropdown = (query = '') => {
                const currentClients = DB.get('clients');
                const filtered = currentClients.filter(c => {
                    const term = query.toLowerCase();
                    return (c.name || '').toLowerCase().includes(term) || (c.phone || '').toLowerCase().includes(term);
                });

                if (filtered.length > 0) {
                    dropdown.innerHTML = filtered.map(c => `
                        <div class="searchable-select-item" data-id="${c.id}" data-name="${escapeHtml(c.name)}" data-phone="${escapeHtml(c.phone || '')}">
                            <div class="searchable-select-item-name">${escapeHtml(c.name)}</div>
                            <div class="searchable-select-item-details">
                                ${c.phone ? `<span><i class="ph ph-phone"></i> ${escapeHtml(c.phone)}</span>` : ''}
                                ${c.email ? `<span><i class="ph ph-envelope"></i> ${escapeHtml(c.email)}</span>` : ''}
                            </div>
                        </div>
                    `).join('');
                    dropdown.classList.remove('d-none');
                } else {
                    dropdown.innerHTML = `
                        <div class="searchable-select-no-results">
                            <span>No se encontraron clientes para "<strong>${escapeHtml(query)}</strong>"</span>
                            <div class="searchable-select-quick-create">
                                <h4><i class="ph ph-plus-circle"></i> Crear Cliente Rápido</h4>
                                <div class="quick-create-inputs">
                                    <input type="text" id="quick-c-name" class="form-control" value="${escapeHtml(query)}" placeholder="Nombre Completo" required>
                                    <input type="text" id="quick-c-phone" class="form-control" placeholder="Teléfono (Obligatorio)" required>
                                </div>
                                <button type="button" id="btn-quick-create-client" class="btn btn-primary btn-sm searchable-select-quick-create-btn">
                                    <i class="ph ph-check"></i> Crear y Seleccionar
                                </button>
                            </div>
                        </div>
                    `;
                    dropdown.classList.remove('d-none');
                    
                    // Attach Quick Create event
                    const quickCreateBtn = document.getElementById('btn-quick-create-client');
                    if (quickCreateBtn) {
                        quickCreateBtn.addEventListener('click', (e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            const nameVal = document.getElementById('quick-c-name').value.trim();
                            const phoneVal = document.getElementById('quick-c-phone').value.trim();

                            if (!nameVal || !phoneVal) {
                                alert('Por favor, complete el nombre y el teléfono.');
                                return;
                            }

                            const newClient = DB.add('clients', {
                                name: nameVal,
                                phone: phoneVal,
                                email: '',
                                address: ''
                            });

                            selectClient(newClient.id, newClient.name, newClient.phone);
                            Toast.show('Cliente creado y seleccionado', 'success');
                        });
                    }
                }
            };

            const selectClient = (id, name, phone) => {
                hiddenInput.value = id;
                searchInput.value = `${name} (${phone || 'Sin Teléfono'})`;
                searchInput.disabled = true;
                wrapper.classList.add('has-selection');
                clearBtn.classList.remove('d-none');
                dropdown.classList.add('d-none');
            };

            const clearSelection = () => {
                hiddenInput.value = '';
                searchInput.value = '';
                searchInput.disabled = false;
                wrapper.classList.remove('has-selection');
                clearBtn.classList.add('d-none');
                dropdown.classList.add('d-none');
                searchInput.focus();
            };

            searchInput.addEventListener('focus', () => {
                if (!hiddenInput.value) {
                    renderDropdown(searchInput.value);
                }
            });

            searchInput.addEventListener('input', () => {
                renderDropdown(searchInput.value);
            });

            clearBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                clearSelection();
            });

            // Selection from list
            dropdown.addEventListener('click', (e) => {
                const item = e.target.closest('.searchable-select-item');
                if (item) {
                    e.preventDefault();
                    e.stopPropagation();
                    const id = item.dataset.id;
                    const name = item.dataset.name;
                    const phone = item.dataset.phone;
                    selectClient(id, name, phone);
                }
            });

            // Click outside to close dropdown
            document.addEventListener('click', (e) => {
                if (!e.target.closest('.searchable-select-container')) {
                    dropdown.classList.add('d-none');
                }
            });
        }

        document.getElementById('repair-form').addEventListener('submit', (e) => {
            e.preventDefault();
            
            if (isEdit) {
                const data = {
                    equipment: document.getElementById('r-equipment').value,
                    status: document.getElementById('r-status').value,
                    problem: document.getElementById('r-problem').value,
                    notes: document.getElementById('r-notes').value
                };
                DB.update('repairs', repair.id, data);
                this.renderRepairsAdmin();
            } else {
                let clientId = '';
                const isCreateMode = document.getElementById('btn-mode-create').classList.contains('active');

                if (isCreateMode) {
                    const nameVal = document.getElementById('new-c-name').value.trim();
                    const phoneVal = document.getElementById('new-c-phone').value.trim();

                    if (!nameVal || !phoneVal) {
                        alert('Por favor complete el nombre y teléfono del nuevo cliente.');
                        return;
                    }

                    const newClient = DB.add('clients', {
                        name: nameVal,
                        phone: phoneVal,
                        email: '',
                        address: ''
                    });
                    clientId = newClient.id;
                    Toast.show('Cliente creado con éxito', 'success');
                } else {
                    clientId = document.getElementById('r-client').value;
                    if (!clientId) {
                        alert('Por favor seleccione un cliente o cree uno nuevo.');
                        return;
                    }
                }

                // Generar ID y clave única alfanumérica de 5 caracteres
                const allRepairs = DB.get('repairs');
                const repairNum = (allRepairs.length + 1).toString().padStart(3, '0');
                const newId = `REP-${repairNum}`;
                let code;
                const usedCodes = new Set(allRepairs.map(r => r.code));
                const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Evitamos caracteres ambiguos como 0, O, 1, I
                do { 
                    code = '';
                    for (let i = 0; i < 5; i++) {
                        code += chars.charAt(Math.floor(Math.random() * chars.length));
                    }
                } while (usedCodes.has(code));

                const data = {
                    id: newId,
                    code: code,
                    clientId: document.getElementById('r-client').value,
                    equipment: document.getElementById('r-equipment').value,
                    status: document.getElementById('r-status').value,
                    problem: document.getElementById('r-problem').value,
                    notes: document.getElementById('r-notes').value,
                    date: new Date().toISOString().split('T')[0]
                };
                allRepairs.push(data);
                DB.set('repairs', allRepairs);
                this.renderRepairsAdmin();
                // Mostrar la clave generada
                const client = clients.find(c => c.id === data.clientId) || {};
                setTimeout(() => {
                    Modal.open(`
                        <div class="modal-header">
                            <h3>✅ Orden Creada Exitosamente</h3>
                            <button class="modal-close" onclick="Modal.close()"><i class="ph ph-x"></i></button>
                        </div>
                        <div style="text-align: center; padding: 1rem 0;">
                            <p style="color: var(--text-muted); margin-bottom: 1rem;">Entregale esta clave al cliente para que pueda rastrear su reparación:</p>
                            <div style="background: var(--accent-blue); color: white; padding: 1.5rem; border-radius: 1rem; margin: 1rem 0;">
                                <div style="font-size: 0.8rem; opacity: 0.85; margin-bottom: 0.5rem;">CLAVE DE CONSULTA</div>
                                <div style="font-size: 4rem; font-weight: 900; letter-spacing: 0.6rem;">${code}</div>
                            </div>
                            <p style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 1.5rem;">Orden: <strong>${newId}</strong></p>
                            
                            <div class="flex gap-2">
                                <button class="btn btn-primary" onclick="Pages.printRepairPDF('${code}'); Modal.close();" style="flex: 1;">
                                    <i class="ph ph-printer"></i> Imprimir / PDF
                                </button>
                                ${client.phone ? `
                                <button class="btn btn-whatsapp" onclick="WA.sendRepairDetails('${client.name}', '${client.phone}', '${code}', '${data.equipment}'); Modal.close();" style="flex: 1;">
                                    <i class="ph ph-whatsapp-logo"></i> Enviar a Cliente
                                </button>
                                ` : ''}
                            </div>
                            <button class="btn btn-secondary w-100 mt-4" onclick="Modal.close()">Cerrar</button>
                        </div>
                    `);
                }, 100);
            }
        });

        if (isEdit) {
            document.getElementById('btn-delete-repair-modal').addEventListener('click', () => {
                if (confirm('¿Está seguro de eliminar esta orden de reparación de forma permanente?')) {
                    DB.delete('repairs', repair.id);
                    const historyToggle = document.getElementById('toggle-history');
                    this.renderRepairsAdmin(historyToggle ? historyToggle.checked : false);
                }
            });
        }
    },

    renderServicesAdmin() {
        const services = DB.get('services');
        this.app.innerHTML = `
            <div style="max-width: 1000px; margin: 0 auto;">
                <div class="flex justify-between items-center mb-4" style="flex-wrap: wrap; gap: 1rem;">
                    <h1 style="margin-bottom: 0;">Gestión de Servicios</h1>
                    <div style="display: flex; gap: 0.75rem; flex-wrap: wrap; align-items: center;">
                        <div style="position: relative;">
                            <i class="ph ph-magnifying-glass" style="position: absolute; left: 0.75rem; top: 50%; transform: translateY(-50%); color: var(--text-muted);"></i>
                            <input type="text" id="search-services" class="form-control" placeholder="Buscar servicio..." style="padding-left: 2.2rem; width: 220px;">
                        </div>
                        <button class="btn btn-primary" id="btn-add-service">
                            <i class="ph ph-plus"></i> Nuevo Servicio
                        </button>
                    </div>
                </div>
                
                <div class="glass" style="overflow-x: auto; border-radius: 1rem;">
                    <table class="table">
                        <thead>
                            <tr>
                                <th>Icono</th>
                                <th>Nombre</th>
                                <th>Descripción</th>
                                <th>Acciones</th>
                            </tr>
                        </thead>
                        <tbody id="admin-services-tbody">
                            ${services.map(s => `
                                <tr>
                                    <td style="font-size: 1.5rem; color: var(--accent-cyan); text-align: center;"><i class="ph ${s.icon || 'ph-wrench'}"></i></td>
                                    <td>${s.name}</td>
                                    <td style="max-width: 300px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${s.desc}</td>
                                    <td>
                                        <button class="btn btn-secondary btn-edit" data-id="${s.id}"><i class="ph ph-pencil"></i></button>
                                        <button class="btn btn-danger btn-delete" data-id="${s.id}"><i class="ph ph-trash"></i></button>
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;

        document.getElementById('btn-add-service').addEventListener('click', () => this.showServiceModal());
        
        // Buscador en tiempo real
        document.getElementById('search-services').addEventListener('input', (e) => {
            const q = e.target.value.trim().toLowerCase();
            const queryWords = q ? q.split(/\s+/) : [];
            document.querySelectorAll('#admin-services-tbody tr').forEach(row => {
                if (queryWords.length === 0) {
                    row.style.display = '';
                    return;
                }
                const content = row.textContent.toLowerCase();
                row.style.display = queryWords.every(word => content.includes(word)) ? '' : 'none';
            });
        });
        
        document.querySelectorAll('.btn-edit').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = e.target.closest('button').dataset.id;
                this.showServiceModal(services.find(s => s.id === id));
            });
        });

        document.querySelectorAll('.btn-delete').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = e.target.closest('button').dataset.id;
                if(confirm('¿Eliminar este servicio?')) {
                    DB.delete('services', id);
                    this.renderServicesAdmin();
                }
            });
        });

        // Doble clic para editar
        document.querySelectorAll('#admin-services-tbody tr').forEach(row => {
            row.addEventListener('dblclick', () => {
                const id = row.querySelector('.btn-edit').dataset.id;
                this.showServiceModal(services.find(s => s.id === id));
            });
        });
    },

    showServiceModal(service = null) {
        const isEdit = !!service;
        const availableIcons = [
            'ph-wrench', 'ph-cpu', 'ph-desktop', 'ph-laptop', 'ph-device-mobile',
            'ph-monitor', 'ph-keyboard', 'ph-mouse', 'ph-hard-drive', 'ph-memory',
            'ph-fan', 'ph-plug', 'ph-wifi-high', 'ph-shield-check', 'ph-database',
            'ph-cloud-arrow-up', 'ph-broom', 'ph-gear', 'ph-printer', 'ph-headset'
        ];
        const selectedIcon = isEdit ? (service.icon || 'ph-wrench') : 'ph-wrench';

        Modal.open(`
            <div class="modal-header">
                <h3>${isEdit ? 'Editar Servicio' : 'Nuevo Servicio'}</h3>
                <button class="modal-close" onclick="Modal.close()"><i class="ph ph-x"></i></button>
            </div>
            <form id="service-form">
                <div class="form-grid">
                    <div>
                        <div class="form-group">
                            <label class="form-label">Nombre del Servicio</label>
                            <input type="text" id="s-name" class="form-control" value="${isEdit ? service.name : ''}" required>
                        </div>
                        <div class="form-group">
                            <label class="form-label">Descripción</label>
                            <textarea id="s-desc" class="form-control" style="height: 120px;" required>${isEdit ? service.desc : ''}</textarea>
                        </div>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Seleccionar Icono</label>
                        <input type="hidden" id="s-icon" value="${selectedIcon}">
                        <div class="icon-grid" style="grid-template-columns: repeat(5, 1fr); gap: 0.5rem; max-height: 180px; overflow-y: auto; padding: 0.5rem; border: 1px solid var(--glass-border); border-radius: 0.5rem;">
                            ${availableIcons.map(icon => `
                                <div class="icon-option ${icon === selectedIcon ? 'active' : ''}" data-icon="${icon}" style="padding: 0.5rem; font-size: 1.25rem;">
                                    <i class="ph ${icon}"></i>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                </div>
                <button type="submit" class="btn btn-primary w-100" style="width:100%;">${isEdit ? 'Guardar Cambios' : 'Crear Servicio'}</button>
            </form>
        `);

        // Icon selection logic
        const iconOptions = document.querySelectorAll('.icon-option');
        const iconInput = document.getElementById('s-icon');
        iconOptions.forEach(opt => {
            opt.addEventListener('click', () => {
                iconOptions.forEach(o => o.classList.remove('active'));
                opt.classList.add('active');
                iconInput.value = opt.dataset.icon;
            });
        });

        document.getElementById('service-form').addEventListener('submit', (e) => {
            e.preventDefault();
            const data = {
                name: document.getElementById('s-name').value,
                icon: document.getElementById('s-icon').value,
                desc: document.getElementById('s-desc').value
            };

            if (isEdit) {
                DB.update('services', service.id, data);
            } else {
                DB.add('services', data);
            }
            Modal.close();
            this.renderServicesAdmin();
        });
    },

    renderClientsAdmin() {
        const clients = DB.get('clients');
        this.app.innerHTML = `
            <div class="flex justify-between items-center mb-4" style="flex-wrap: wrap; gap: 1rem;">
                <h1 style="margin-bottom: 0;">Gestión de Clientes</h1>
                <div style="display: flex; gap: 0.75rem; flex-wrap: wrap; align-items: center;">
                    <div style="position: relative;">
                        <i class="ph ph-magnifying-glass" style="position: absolute; left: 0.75rem; top: 50%; transform: translateY(-50%); color: var(--text-muted);"></i>
                        <input type="text" id="search-clients" class="form-control" placeholder="Buscar cliente..." style="padding-left: 2.2rem; width: 220px;">
                    </div>
                    <button class="btn btn-primary" id="btn-add-client"><i class="ph ph-plus"></i> Nuevo Cliente</button>
                </div>
            </div>
            
            <div class="table-container glass">
                <table>
                    <thead>
                        <tr>
                            <th>Nombre</th>
                            <th>Teléfono</th>
                            <th>Email</th>
                            <th>Dirección</th>
                            <th>Acciones</th>
                        </tr>
                    </thead>
                    <tbody id="admin-clients-tbody">
                        ${clients.map(c => `
                            <tr>
                                <td>${c.name}</td>
                                <td>${c.phone}</td>
                                <td>${c.email}</td>
                                <td>${c.address}</td>
                                <td>
                                    <button class="btn btn-secondary btn-edit" data-id="${c.id}"><i class="ph ph-pencil"></i></button>
                                    <button class="btn btn-danger btn-delete" data-id="${c.id}"><i class="ph ph-trash"></i></button>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;

        document.getElementById('btn-add-client').addEventListener('click', () => this.showClientModal());
        
        // Buscador en tiempo real
        document.getElementById('search-clients').addEventListener('input', (e) => {
            const q = e.target.value.trim().toLowerCase();
            const queryWords = q ? q.split(/\s+/) : [];
            document.querySelectorAll('#admin-clients-tbody tr').forEach(row => {
                if (queryWords.length === 0) {
                    row.style.display = '';
                    return;
                }
                const content = row.textContent.toLowerCase();
                row.style.display = queryWords.every(word => content.includes(word)) ? '' : 'none';
            });
        });
        
        document.querySelectorAll('.btn-edit').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = e.target.closest('button').dataset.id;
                this.showClientModal(clients.find(c => c.id === id));
            });
        });

        document.querySelectorAll('.btn-delete').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = e.target.closest('button').dataset.id;
                if(confirm('¿Eliminar este cliente? (Asegúrese que no tenga reparaciones activas)')) {
                    DB.delete('clients', id);
                    this.renderClientsAdmin();
                }
            });
        });

        // Doble clic para editar
        document.querySelectorAll('#admin-clients-tbody tr').forEach(row => {
            row.addEventListener('dblclick', () => {
                const id = row.querySelector('.btn-edit').dataset.id;
                this.showClientModal(clients.find(c => c.id === id));
            });
        });
    },

    showClientModal(client = null) {
        const isEdit = !!client;
        Modal.open(`
            <div class="modal-header">
                <h3>${isEdit ? 'Editar Cliente' : 'Nuevo Cliente'}</h3>
                <button class="modal-close" onclick="Modal.close()"><i class="ph ph-x"></i></button>
            </div>
            <form id="client-form">
                <div class="form-grid">
                    <div class="form-group">
                        <label class="form-label">Nombre Completo</label>
                        <input type="text" id="c-name" class="form-control" value="${isEdit ? client.name : ''}" required>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Teléfono</label>
                        <input type="text" id="c-phone" class="form-control" value="${isEdit ? client.phone : ''}" required>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Email (Opcional)</label>
                        <input type="email" id="c-email" class="form-control" value="${isEdit ? client.email : ''}">
                    </div>
                    <div class="form-group">
                        <label class="form-label">Dirección (Opcional)</label>
                        <input type="text" id="c-address" class="form-control" value="${isEdit ? client.address : ''}">
                    </div>
                </div>
                <button type="submit" class="btn btn-primary w-100" style="width:100%;">${isEdit ? 'Guardar Cambios' : 'Crear Cliente'}</button>
            </form>
        `);

        document.getElementById('client-form').addEventListener('submit', (e) => {
            e.preventDefault();
            const data = {
                name: document.getElementById('c-name').value,
                phone: document.getElementById('c-phone').value,
                email: document.getElementById('c-email').value,
                address: document.getElementById('c-address').value
            };

            if (isEdit) {
                DB.update('clients', client.id, data);
            } else {
                DB.add('clients', data);
            }
            Modal.close();
            this.renderClientsAdmin();
        });
    },

    renderConfig() {
        const config = DB.getConfig();
        this.app.innerHTML = `
            <div style="max-width: 600px; margin: 0 auto;">
                <h1>Configuración de Empresa</h1>
                <div class="glass" style="padding: 2rem; border-radius: 1rem;">
                    <form id="config-form">
                        <div class="form-group">
                            <label class="form-label">Nombre de la Empresa</label>
                            <input type="text" id="cfg-name" class="form-control" value="${config.companyName}" required>
                        </div>
                        <div class="form-group">
                            <label class="form-label">Dirección</label>
                            <input type="text" id="cfg-address" class="form-control" value="${config.address}" required>
                        </div>
                        <div class="flex gap-2">
                            <div class="form-group" style="flex:1;">
                                <label class="form-label">Teléfono (Fijo)</label>
                                <input type="text" id="cfg-phone" class="form-control" value="${config.phone}" required>
                            </div>
                            <div class="form-group" style="flex:1;">
                                <label class="form-label">Número de WhatsApp (con cód. país, ej: 5491100000000)</label>
                                <input type="text" id="cfg-whatsapp" class="form-control" value="${config.whatsapp}" required>
                            </div>
                        </div>
                        <div class="form-group">
                            <label class="form-label">Email de Contacto</label>
                            <input type="email" id="cfg-email" class="form-control" value="${config.email}" required>
                        </div>
                        <div class="form-group">
                            <label class="form-label">Horarios de Atención</label>
                            <input type="text" id="cfg-hours" class="form-control" value="${config.hours || ''}" placeholder="Ej: Lun a Vie 9:00 a 18:00">
                        </div>
                        <div class="flex gap-2">
                            <div class="form-group" style="flex:1;">
                                <label class="form-label">Instagram (URL)</label>
                                <input type="url" id="cfg-ig" class="form-control" value="${config.instagram || ''}" placeholder="https://instagram.com/tuusuario">
                            </div>
                            <div class="form-group" style="flex:1;">
                                <label class="form-label">Facebook (URL)</label>
                                <input type="url" id="cfg-fb" class="form-control" value="${config.facebook || ''}" placeholder="https://facebook.com/tupagina">
                            </div>
                        </div>

                        <div style="border-top: 1px solid var(--glass-border); margin: 1.5rem 0; padding-top: 1.5rem;">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
                                <h3 style="margin: 0; text-align: left;">Métricas y SEO</h3>
                                <div id="metrics-status-badge">
                                    ${(config.googleAnalyticsId || config.gtmId) 
                                        ? '<span class="status-badge status-Finalizada"><i class="ph ph-check-circle"></i> Métricas Activas</span>' 
                                        : '<span class="status-badge" style="background: rgba(0,0,0,0.05); color: var(--text-muted);"><i class="ph ph-circle"></i> Sin Configurar</span>'}
                                </div>
                            </div>
                            
                            <div class="form-group">
                                <label class="form-label">Título del Sitio (SEO)</label>
                                <input type="text" id="cfg-site-title" class="form-control" value="${config.siteTitle || ''}" placeholder="Ej: TechStore - Lo mejor en tecnología">
                            </div>
                            
                            <div class="form-group">
                                <label class="form-label">Meta Descripción (SEO)</label>
                                <textarea id="cfg-site-desc" class="form-control" rows="2" placeholder="Breve descripción de tu tienda para Google...">${config.siteDescription || ''}</textarea>
                            </div>

                            <div class="flex gap-2">
                                <div class="form-group" style="flex:1;">
                                    <label class="form-label">Google Analytics 4 ID</label>
                                    <input type="text" id="cfg-ga-id" class="form-control" value="${config.googleAnalyticsId || ''}" placeholder="G-XXXXXXXXXX">
                                </div>
                                <div class="form-group" style="flex:1;">
                                    <label class="form-label">Google Tag Manager ID</label>
                                    <input type="text" id="cfg-gtm-id" class="form-control" value="${config.gtmId || ''}" placeholder="GTM-XXXXXXX">
                                </div>
                            </div>
                            <small style="color: var(--text-muted);">El seguimiento se activará automáticamente al guardar.</small>
                        </div>

                        <div style="border-top: 1px solid var(--glass-border); margin: 1.5rem 0; padding-top: 1.5rem;">
                            <h3 style="margin-bottom: 1rem; text-align: left;">Administración de Productos (Inicio)</h3>
                            <div class="flex gap-4 items-center" style="flex-wrap: wrap;">
                                <div class="form-group" style="flex: 1; min-width: 200px;">
                                    <label class="form-label">Productos visibles en Inicio</label>
                                    <input type="number" id="cfg-home-limit" class="form-control" value="${config.homeProductLimit || 0}" min="0">
                                    <small style="color: var(--text-muted);">0 = Mostrar todos</small>
                                </div>
                                <div class="form-group flex items-center gap-2" style="padding-top: 1rem;">
                                    <input type="checkbox" id="cfg-home-random" ${config.homeRandomOrder ? 'checked' : ''}>
                                    <label for="cfg-home-random" class="form-label" style="margin: 0;">Carga Aleatoria</label>
                                </div>
                            </div>
                        </div>
                        <div class="form-group flex items-center gap-4" style="margin-top: 1rem; flex-wrap: wrap;">
                            <div style="display: flex; gap: 1rem; align-items: center; min-width: 200px;">
                                <input type="checkbox" id="cfg-popup-active" ${config.popupActive ? 'checked' : ''}>
                                <label for="cfg-popup-active" class="form-label" style="margin:0;">Activar Popup</label>
                            </div>
                            <div style="display: flex; gap: 1rem; align-items: center; min-width: 200px;">
                                <input type="checkbox" id="cfg-popup-always" ${config.popupAlways ? 'checked' : ''}>
                                <label for="cfg-popup-always" class="form-label" style="margin:0;">Mostrar siempre</label>
                            </div>
                            <div style="flex:1;">
                                <label class="form-label" style="margin-bottom: 0.25rem;">Duración (segundos)</label>
                                <input type="number" id="cfg-popup-duration" class="form-control" value="${config.popupDuration || 10}" min="0">
                                <small style="color: var(--text-muted); font-size: 0.75rem;">0 = Manual</small>
                            </div>
                            <div style="flex:1;">
                                <label class="form-label" style="margin-bottom: 0.25rem;">Retraso Inicio (seg)</label>
                                <input type="number" id="cfg-popup-delay" class="form-control" value="${config.popupDelay || 1}" min="0">
                                <small style="color: var(--text-muted); font-size: 0.75rem;">Espera para aparecer</small>
                            </div>
                        </div>
                        <div class="form-group">
                            <label class="form-label">Texto del Popup (Opcional)</label>
                            <textarea id="cfg-popup-text" class="form-control" rows="3" placeholder="Ingresa el mensaje que quieres mostrar...">${config.popupText || ''}</textarea>
                        </div>
                        <div class="form-group">
                            <label class="form-label">Imagen del Popup (Drag & Drop)</label>
                            <div id="popup-drop-zone" class="drop-zone ${config.popupImage ? 'drop-zone--has-image' : ''}">
                                <img src="${config.popupImage || ''}" class="drop-zone-preview">
                                <div class="drop-zone-prompt">
                                    <i class="ph ph-image-plus drop-zone-icon"></i>
                                    <span>Arrastra una imagen o clic para subir</span>
                                </div>
                                <input type="file" id="cfg-popup-file" accept="image/*" style="display: none;">
                                <input type="hidden" id="cfg-popup-image" value="${config.popupImage || ''}">
                            </div>
                        </div>
                        <button type="submit" class="btn btn-primary" style="width:100%;">Guardar Configuración</button>
                    </form>
                    <div id="cfg-msg" style="color: var(--success); margin-top: 1rem; display: none; text-align: center;">Configuración guardada correctamente.</div>
                </div>

                <h2 style="margin-top: 3rem; margin-bottom: 1rem;">Sincronización y Respaldo</h2>
                <div class="glass" style="padding: 2rem; border-radius: 1rem;">
                    <p style="color: var(--text-muted); margin-bottom: 1.5rem;">Utiliza esta herramienta para trasladar tus datos de tu entorno local al servidor en vivo.</p>
                    
                    <div class="flex gap-2 mb-4" style="flex-direction: column; gap: 1rem;">
                        <button id="btn-export" class="btn btn-primary" style="width: 100%;">
                            <i class="ph ph-download-simple"></i> Exportar Copia de Seguridad (.json)
                        </button>
                        
                        <div style="border-top: 1px solid var(--glass-border); margin: 1rem 0;"></div>
                        
                        <label class="form-label">Importar Copia de Seguridad</label>
                        <div class="flex gap-2" style="align-items: center;">
                            <input type="file" id="import-file" accept=".json" class="form-control" style="flex: 1;">
                            <button id="btn-import" class="btn btn-secondary">
                                <i class="ph ph-upload-simple"></i> Importar
                            </button>
                        </div>
                        <div id="sync-msg" style="margin-top: 0.5rem; display: none; text-align: center; font-size: 0.875rem;"></div>
                    </div>
                </div>
            </div>
        `;

        const dropZone = document.getElementById('popup-drop-zone');
        const fileInput = document.getElementById('cfg-popup-file');
        const hiddenInput = document.getElementById('cfg-popup-image');
        const previewImg = dropZone.querySelector('.drop-zone-preview');

        const handleFile = (file) => {
            if (file && file.type.startsWith('image/')) {
                const reader = new FileReader();
                reader.onload = (e) => {
                    const base64 = e.target.result;
                    hiddenInput.value = base64;
                    previewImg.src = base64;
                    dropZone.classList.add('drop-zone--has-image');
                };
                reader.readAsDataURL(file);
            }
        };

        dropZone.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', () => {
            if (fileInput.files.length) handleFile(fileInput.files[0]);
        });
        dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropZone.classList.add('drop-zone--over');
        });
        ['dragleave', 'dragend'].forEach(type => {
            dropZone.addEventListener(type, () => dropZone.classList.remove('drop-zone--over'));
        });
        dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropZone.classList.remove('drop-zone--over');
            if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
        });

        document.getElementById('config-form').addEventListener('submit', (e) => {
            e.preventDefault();
            const newConfig = {
                companyName: document.getElementById('cfg-name').value,
                address: document.getElementById('cfg-address').value,
                phone: document.getElementById('cfg-phone').value,
                whatsapp: document.getElementById('cfg-whatsapp').value,
                email: document.getElementById('cfg-email').value,
                hours: document.getElementById('cfg-hours').value,
                instagram: document.getElementById('cfg-ig').value,
                facebook: document.getElementById('cfg-fb').value,
                popupActive: document.getElementById('cfg-popup-active').checked,
                popupImage: document.getElementById('cfg-popup-image').value,
                popupDuration: parseInt(document.getElementById('cfg-popup-duration').value) || 0,
                popupText: document.getElementById('cfg-popup-text').value,
                popupDelay: parseInt(document.getElementById('cfg-popup-delay').value) || 0,
                popupAlways: document.getElementById('cfg-popup-always').checked,
                homeProductLimit: parseInt(document.getElementById('cfg-home-limit').value) || 0,
                homeRandomOrder: document.getElementById('cfg-home-random').checked,
                googleAnalyticsId: document.getElementById('cfg-ga-id').value.trim(),
                gtmId: document.getElementById('cfg-gtm-id').value.trim(),
                siteTitle: document.getElementById('cfg-site-title').value.trim(),
                siteDescription: document.getElementById('cfg-site-desc').value.trim()
            };
            DB.setConfig(newConfig);
            WA.updateFloatingButton();
            UI.updateConfig();
            
            const msg = document.getElementById('cfg-msg');
            msg.style.display = 'block';
            setTimeout(() => msg.style.display = 'none', 3000);
        });

        // Sync Handlers
        document.getElementById('btn-export').addEventListener('click', () => {
            DB.exportData();
        });

        document.getElementById('btn-import').addEventListener('click', () => {
            const fileInput = document.getElementById('import-file');
            if (!fileInput.files.length) {
                alert('Por favor selecciona un archivo .json primero.');
                return;
            }
            
            if (!confirm('ADVERTENCIA: Esto sobrescribirá todos los datos actuales de la aplicación con los del archivo. ¿Deseas continuar?')) return;

            const file = fileInput.files[0];
            const reader = new FileReader();
            reader.onload = (event) => {
                const success = DB.importData(event.target.result);
                const msg = document.getElementById('sync-msg');
                msg.style.display = 'block';
                if (success) {
                    msg.style.color = 'var(--success)';
                    msg.textContent = 'Datos importados correctamente. Recargando...';
                    setTimeout(() => window.location.reload(), 1500);
                } else {
                    msg.style.color = 'var(--danger)';
                    msg.textContent = 'Error: Archivo inválido o corrupto.';
                }
            };
            reader.readAsText(file);
        });
    },

    renderLocalAdmin() {
        this.app.innerHTML = `
            <div style="max-width: 700px; margin: 0 auto;">
                <h1>Servidor Local y Sincronización</h1>
                
                <div class="glass" style="padding: 2rem; border-radius: 1rem; margin-bottom: 2rem;">
                    <h2>Paso 1: Descargar Paquete Local</h2>
                    <p style="color: var(--text-muted); margin-bottom: 1.5rem;">Descarga la aplicación completa lista para ejecutarse en tu PC con Node.js. Esto incluye el servidor local, la interfaz web y tus datos actuales.</p>
                    <button id="btn-download-node" class="btn btn-primary" style="width: 100%;">
                        <i class="ph ph-file-zip"></i> Descargar Paquete Node.js (.zip)
                    </button>
                    <div id="zip-msg" style="margin-top: 1rem; color: var(--text-muted); display: none; text-align: center;">Generando ZIP, por favor espera...</div>
                </div>

                <div class="glass" style="padding: 2rem; border-radius: 1rem; margin-top: 2rem;">
                    <h2>Paso 3: Sincronización Manual (Sync)</h2>
                    <p style="color: var(--text-muted); margin-bottom: 1.5rem;">Sube todos los archivos de tu proyecto local a GitHub de forma manual.</p>
                    <button id="btn-sync-all" class="btn btn-secondary" style="width: 100%;">
                        <i class="ph ph-cloud-arrow-up"></i> Sync con GitHub
                    </button>
                    <div id="sync-all-msg" style="margin-top: 1rem; display: none; text-align: center; font-size: 0.875rem;"></div>
                </div>
            </div>
        `;

        document.getElementById('btn-sync-all').addEventListener('click', async () => {
            const btn = document.getElementById('btn-sync-all');
            const oldHtml = btn.innerHTML;
            btn.disabled = true;
            btn.innerHTML = '<i class="ph ph-spinner-gap anim-spin"></i> Sincronizando...';
            
            try {
                const res = await fetch('/api/sync-full', { method: 'POST' });
                const data = await res.json();
                
                if (data.success) {
                    Modal.open(`
                        <div style="text-align: center; padding: 2rem;">
                            <div style="font-size: 4rem; color: var(--success); margin-bottom: 1rem;">
                                <i class="ph ph-cloud-check"></i>
                            </div>
                            <h2>Sincronización Completa</h2>
                            <p style="color: var(--text-muted); margin-bottom: 1.5rem;">Todos los archivos, el catálogo y el archivo CNAME se han subido correctamente a GitHub.</p>
                            <button class="btn btn-primary w-100" onclick="Modal.close()">Excelente</button>
                        </div>
                    `);
                } else {
                    throw new Error(data.error);
                }
            } catch (err) {
                Modal.open(`
                    <div style="text-align: center; padding: 2rem;">
                        <div style="font-size: 4rem; color: var(--danger); margin-bottom: 1rem;">
                            <i class="ph ph-cloud-x"></i>
                        </div>
                        <h2>Error de Sincronización</h2>
                        <p style="color: var(--text-muted); margin-bottom: 1.5rem;">No se pudieron subir los archivos a GitHub.</p>
                        <div style="background: #fff5f5; color: #c53030; padding: 1rem; border-radius: 0.5rem; margin-bottom: 1.5rem; text-align: left; border: 1px solid #feb2b2; font-size: 0.85rem;">
                            <strong>Error:</strong> ${err.message}
                        </div>
                        <button class="btn btn-secondary w-100" onclick="Modal.close()">Cerrar</button>
                    </div>
                `);
            } finally {
                btn.disabled = false;
                btn.innerHTML = oldHtml;
            }
        });

        document.getElementById('btn-download-node').addEventListener('click', async () => {
            if (typeof JSZip === 'undefined') {
                alert('La librería JSZip no se ha cargado. Por favor verifica tu conexión a internet.');
                return;
            }
            
            const msg = document.getElementById('zip-msg');
            msg.style.display = 'block';
            msg.textContent = 'Generando ZIP, por favor espera...';

            try {
                const zip = new JSZip();
                
                // Package.json
                const packageJson = {
                  "name": "techstore-local",
                  "version": "1.0.0",
                  "description": "Servidor local para el catálogo",
                  "main": "server.js",
                  "scripts": {
                    "start": "node server.js"
                  },
                  "dependencies": {
                    "express": "^4.18.2",
                    "cors": "^2.8.5"
                  }
                };
                zip.file("package.json", JSON.stringify(packageJson, null, 2));

                // server.js
                const serverJs = `const express = require('express');
const fs = require('fs');
const { exec } = require('child_process');
const path = require('path');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json({limit: '50mb'}));
app.use(express.static(__dirname));

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
                execSync(\`git clone \${repoUrl} "\${tmpDir}"\`, {stdio: 'ignore'});
                fs.copyFileSync(path.join(__dirname, 'data.json'), path.join(tmpDir, 'data.json'));
                execSync(\`git config user.name "TechStore Admin"\`, { cwd: tmpDir });
                execSync(\`git config user.email "admin@techstore.local"\`, { cwd: tmpDir });
                execSync(\`git add data.json\`, { cwd: tmpDir });
                execSync(\`git commit -m "Auto-sync background"\`, { cwd: tmpDir, stdio: 'ignore' });
                execSync(\`git push origin main\`, { cwd: tmpDir, stdio: 'ignore' });
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
});`;
                zip.file("server.js", serverJs);

                // Fetch frontend files to include them
                const fetchFile = async (filename) => {
                    try {
                        const res = await fetch(filename + '?v=' + Date.now());
                        if(!res.ok) throw new Error('Not found');
                        return await res.text();
                    } catch(e) { return ''; }
                };

                const indexHtml = await fetchFile('index.html');
                const styleCss = await fetchFile('style.css');
                const appJs = await fetchFile('app.js');

                if (indexHtml) zip.file("index.html", indexHtml);
                if (styleCss) zip.file("style.css", styleCss);
                if (appJs) zip.file("app.js", appJs);

                // current data.json
                const currentData = {
                    products: DB.get('products'),
                    clients: DB.get('clients'),
                    repairs: DB.get('repairs'),
                    config: DB.getConfig()
                };
                zip.file("data.json", JSON.stringify(currentData, null, 2));

                // start.bat for Windows users
                const startBat = `@echo off
echo =======================================
echo Iniciando Servidor Local TechStore
echo =======================================
echo.
echo Verificando e instalando dependencias (esto puede tardar unos segundos)...
call npm install
echo.
echo Iniciando el servidor...
call npm start
pause`;
                zip.file("iniciar_servidor.bat", startBat);

                // Generate and download
                const content = await zip.generateAsync({type:"blob"});
                const url = URL.createObjectURL(content);
                const a = document.createElement('a');
                a.href = url;
                a.download = "techstore-local-app.zip";
                a.click();
                URL.revokeObjectURL(url);
                
                msg.textContent = '¡Paquete descargado con éxito!';
                msg.style.color = 'var(--success)';
            } catch (err) {
                console.error(err);
                msg.textContent = 'Error al generar el ZIP: ' + err.message;
                msg.style.color = 'var(--danger)';
            }
        });
    }
};

// --- Router Module ---
const Router = {
    isLocal() {
        return window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    },

    routes: {
        '/': () => Pages.renderCatalog(false),
        '/ofertas': () => Pages.renderCatalog(true),
        '/servicios': () => Pages.renderServicesPublic(),
        '/reparaciones': () => Pages.renderRepairsPublic(),
        '/admin/login': () => Pages.renderLogin(),
        '/admin': () => Pages.renderDashboard(),
        '/admin/productos': () => Pages.renderProductsAdmin(),
        '/admin/servicios': () => Pages.renderServicesAdmin(),
        '/admin/clientes': () => Pages.renderClientsAdmin(),
        '/admin/reparaciones': () => Pages.renderRepairsAdmin(),
        '/admin/local': () => Pages.renderLocalAdmin(),
        '/admin/config': () => Pages.renderConfig(),
    },

    navigate(path) {
        window.location.hash = path;
    },

    handleRoute() {
        const path = window.location.hash.slice(1) || '/';

        // Bloqueo de seguridad: Solo permitir acceso a admin desde localhost
        if (path.startsWith('/admin') && !this.isLocal()) {
            this.navigate('/');
            return;
        }

        
        // Al cambiar de ruta, siempre volver al inicio del scroll
        window.scrollTo(0, 0);

        // Auth Guard for admin routes
        if (path.startsWith('/admin') && path !== '/admin/login' && !Auth.isAuthenticated()) {
            this.navigate('/admin/login');
            return;
        }

        // Redirect away from login if already authenticated
        if (path === '/admin/login' && Auth.isAuthenticated()) {
            this.navigate('/admin');
            return;
        }

        // Update Nav UI
        this.updateNavUI(path);

        // Execute route
        const handler = this.routes[path];
        if (handler) {
            handler();
        } else {
            Pages.app.innerHTML = '<h1>404 - Página no encontrada</h1>';
        }
    },

    updateNavUI(path) {
        const publicNav = document.getElementById('public-nav');
        const adminNav = document.getElementById('admin-nav');
        const footer = document.querySelector('footer.footer');
        const floatingWa = document.getElementById('floating-wa');
        
        if (path.startsWith('/admin') && Auth.isAuthenticated()) {
            publicNav.classList.add('d-none');
            adminNav.classList.remove('d-none');
            if (footer) footer.classList.add('d-none');
            if (floatingWa) floatingWa.classList.add('d-none');
        } else {
            publicNav.classList.remove('d-none');
            adminNav.classList.add('d-none');
            if (footer) footer.classList.remove('d-none');
            // WhatsApp button should follow config
            const config = DB.getConfig();
            if (floatingWa) {
                floatingWa.style.display = config.whatsapp ? 'flex' : 'none';
                floatingWa.classList.remove('d-none');
            }
        }

        // Update active class
        document.querySelectorAll('.nav-link').forEach(link => {
            link.classList.remove('active');
            if (link.dataset.route === path) {
                link.classList.add('active');
            }
        });
    }
};

// --- Initialization ---
document.addEventListener('DOMContentLoaded', async () => {
    await DB.init();
    WA.updateFloatingButton();
    UI.updateConfig();
    Stats.increment();
    
    // Listen for hash changes
    window.addEventListener('hashchange', () => Router.handleRoute());
    
    // Initial route
    const urlParams = new URLSearchParams(window.location.search);
    const productId = urlParams.get('id');
    if (productId) {
        Pages.renderCatalog(false, productId);
    } else {
        Router.handleRoute();
    }

    // Keyboard shortcut for Admin
    window.addEventListener('keydown', (e) => {
        if (!Router.isLocal()) return;
        // AltGr issues on Windows make Ctrl+Alt unreliable. Using Ctrl+Shift+A or Shift+Alt+A
        if (e.ctrlKey && e.altKey && e.code === 'KeyP') {
            e.preventDefault();
            Router.navigate('/admin');
        }
    });

    // Secret click on Brand Logo (5 clicks)
    let brandClickCount = 0;
    let brandClickTimer;
    document.addEventListener('click', (e) => {
        if (e.target.closest('.nav-brand')) {
            if (!Router.isLocal()) return;
            brandClickCount++;
            clearTimeout(brandClickTimer);
            if (brandClickCount >= 5) {
                brandClickCount = 0;
                Router.navigate('/admin');
            } else {
                brandClickTimer = setTimeout(() => brandClickCount = 0, 1000);
            }
        }
    });

    // Logout handler
    document.getElementById('btn-logout').addEventListener('click', (e) => {
        e.preventDefault();
        Auth.logout();
    });
});
