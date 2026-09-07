let App = { uid: "", pass: "", aid: "", nick: "", reg: "", items: [], itemDb: {}, version: "", currentView: "standard", fileUid: "", filePass: "", tab: "file" };

const rarityBase = { 
    "WHITE": "/api/rarity-bg/WHITE", 
    "GREEN": "/api/rarity-bg/GREEN", 
    "BLUE": "/api/rarity-bg/BLUE", 
    "PURPLE": "/api/rarity-bg/PURPLE", 
    "ORANGE": "/api/rarity-bg/ORANGE", 
    "RED": "/api/rarity-bg/RED" 
};

const API_URL = "/api/wishlist";
const accInp = document.getElementById('accInp');
let selectedSearchIds = new Set();
let selectedLibraryIds = new Set();
let libraryFilteredItems = [];
let libraryRenderedCount = 0;
const LIBRARY_PAGE_SIZE = 60;

const SECURE_HEADER_VALUE = "SECURE_AJAX_CLIENT_OB53";

function parseItemId(item) {
    if (!item) return null;
    if (typeof item !== 'object') return String(item);
    const id = item.Id || item.id || item.itemId || item.item_id || item.ItemId || item.Item_Id || item.Item_id;
    return id ? String(id) : null;
}

function showLoginError(msg) {
    let errEl = document.getElementById('login-error-msg');
    if (!errEl) {
        errEl = document.createElement('div');
        errEl.id = 'login-error-msg';
        errEl.className = 'text-red-500 text-xs font-bold uppercase tracking-wider text-center mt-4 px-4';
        const btn = document.querySelector('#view-login .btn-mechanical');
        if (btn) { btn.parentNode.insertBefore(errEl, btn); }
    }
    errEl.innerText = msg;
}

function getItemIconHTML(id) {
    return `
    <div class="relative w-full h-[60%] flex items-center justify-center overflow-hidden">
        <img id="img-${id}" src="/api/itemicon/${id}" onerror="this.style.display='none'; document.getElementById('na-${id}').classList.remove('hidden');" class="card-item-img" alt="Item Image">
        <div id="na-${id}" class="hidden text-zinc-500 text-[8px] font-bold uppercase tracking-widest text-center select-none px-2">
            Not Available
        </div>
    </div>`;
}

function handleFile(file) {
    if (!file) return;
    const r = new FileReader();
    r.onload = ev => {
        try {
            const d = JSON.parse(ev.target.result);
            App.fileUid = d.guest_account_info["com.garena.msdk.guest_uid"];
            App.filePass = d.guest_account_info["com.garena.msdk.guest_password"];
            document.getElementById('f-label').innerText = file.name.toUpperCase();
            showLoginError("");
        } catch(err) {
            showLoginError("INVALID GUEST FILE FORMAT");
        }
    };
    r.readAsText(file);
}

// System initialization
(async function init() {
    const handshakeHeaders = {
        "Content-Type": "application/json",
        "X-Sec-Header": SECURE_HEADER_VALUE
    };

    const verPromise = fetch('/api/version', { method: "POST", headers: handshakeHeaders })
        .then(res => res.json())
        .then(data => { if (data && data.version) App.version = data.version; })
        .catch(() => {});

    const dbPromise = fetch('/api/itemdata', { method: "POST", headers: handshakeHeaders })
        .then(res => res.json())
        .then(data => { App.itemDb = data || {}; })
        .catch(() => {});

    await Promise.all([verPromise, dbPromise]);

    const dropZone = document.getElementById('drop-zone');
    if (dropZone) {
        ['dragenter', 'dragover'].forEach(eventName => {
            dropZone.addEventListener(eventName, e => {
                e.preventDefault();
                dropZone.style.borderColor = 'var(--ff-yellow)';
                dropZone.style.backgroundColor = '#0c0c0c';
            }, false);
        });

        ['dragleave', 'dragend', 'drop'].forEach(eventName => {
            dropZone.addEventListener(eventName, e => {
                e.preventDefault();
                dropZone.style.borderColor = '';
                dropZone.style.backgroundColor = '';
            }, false);
        });

        dropZone.addEventListener('drop', e => {
            const dt = e.dataTransfer;
            if (dt.files.length) handleFile(dt.files[0]);
        }, false);
    }

    if (accInp) {
        accInp.onchange = e => {
            if (e.target.files.length) handleFile(e.target.files[0]);
        };
    }

    if (localStorage.getItem("wishlist_remember") === "true") {
        const savedUid = localStorage.getItem("wishlist_uid") || "";
        const savedPass = localStorage.getItem("wishlist_pass") || "";
        const inUid = document.getElementById('in-uid');
        const inPass = document.getElementById('in-pass');
        const remBox = document.getElementById('remember-me');
        if (inUid) inUid.value = savedUid;
        if (inPass) inPass.value = savedPass;
        if (remBox) remBox.checked = true;
    }

    const savedSession = localStorage.getItem("wishlist_session");
    if (savedSession) {
        try {
            const sess = JSON.parse(savedSession);
            App.uid = sess.uid;
            App.pass = sess.pass;
            App.aid = sess.aid;
            App.nick = sess.nick;
            App.reg = sess.reg;

            document.getElementById('d-nick').innerText = App.nick;
            document.getElementById('d-uid-ghost').innerText = App.aid;
            document.getElementById('d-reg-badge').innerText = App.reg.toUpperCase();

            document.getElementById('view-login').classList.add('hidden');
            document.getElementById('view-dash').classList.remove('hidden');

            refreshGridData();
        } catch (e) {
            localStorage.removeItem("wishlist_session");
        }
    }

    setupMainInputAutocomplete();
})();

// Autocomplete and Item Name Search for Item ID input
function setupMainInputAutocomplete() {
    const itemInput = document.getElementById('item-id');
    const autoBox = document.getElementById('autocomplete-results');
    if (!itemInput || !autoBox) return;

    itemInput.addEventListener('input', () => {
        const query = itemInput.value.trim().toLowerCase();
        if (!query) {
            autoBox.classList.add('hidden');
            autoBox.innerHTML = '';
            return;
        }

        // Get current last term after comma if user enters comma-separated list
        const terms = query.split(',');
        const lastTerm = terms[terms.length - 1].trim();

        if (lastTerm.length < 2) {
            autoBox.classList.add('hidden');
            autoBox.innerHTML = '';
            return;
        }

        const matches = [];
        for (const [id, info] of Object.entries(App.itemDb)) {
            const name = (info.name || "").toLowerCase();
            if (id.includes(lastTerm) || name.includes(lastTerm)) {
                matches.push({ id, ...info });
                if (matches.length >= 25) break; // Limit suggestions for clean UI
            }
        }

        if (matches.length === 0) {
            autoBox.classList.add('hidden');
            autoBox.innerHTML = '';
            return;
        }

        autoBox.innerHTML = matches.map(item => {
            let cleanRare = (item.rare || "WHITE").toUpperCase().replace("PLUS", "").replace(/[^A-Z]/g, "").trim();
            let bgStyle = rarityBase[cleanRare] ? `background-image: url('${rarityBase[cleanRare]}');` : 'background-color: #1a1a1a;';
            return `
            <div class="suggestion-item" onclick="selectSuggestedItem('${item.id}')">
                <div class="suggestion-thumb" style="${bgStyle}">
                    <img src="/api/itemicon/${item.id}" onerror="this.style.display='none'">
                </div>
                <div class="flex flex-col overflow-hidden">
                    <span class="text-xs text-white font-bold truncate">${item.name || 'Unknown'}</span>
                    <span class="text-[9px] text-yellow-500 font-mono">ID: ${item.id}</span>
                </div>
            </div>`;
        }).join('');

        autoBox.classList.remove('hidden');
    });

    document.addEventListener('click', (e) => {
        if (!itemInput.contains(e.target) && !autoBox.contains(e.target)) {
            autoBox.classList.add('hidden');
        }
    });
}

function selectSuggestedItem(selectedId) {
    const itemInput = document.getElementById('item-id');
    const autoBox = document.getElementById('autocomplete-results');
    
    let parts = itemInput.value.split(',');
    parts.pop(); // Remove text user typed to search
    parts.push(selectedId);

    itemInput.value = parts.map(p => p.trim()).filter(Boolean).join(', ');
    autoBox.classList.add('hidden');
    autoBox.innerHTML = '';
    itemInput.focus();
}

const SVGS = { 
    process: `<i class="fa-solid fa-spinner animate-spin text-zinc-500"></i>`, 
    success: `<i class="fa-solid fa-check-circle text-[#00ffa3]"></i>`, 
    error: `<i class="fa-solid fa-triangle-exclamation text-red-500"></i>` 
};

function switchTab(t) {
    document.getElementById('t-file').className = `flex-1 py-3 text-[10px] font-black rounded-full text-white bg-zinc-800 flex items-center justify-center gap-2 ${t==='file'?'text-white bg-zinc-800':'text-zinc-600'}`;
    document.getElementById('t-manual').className = `flex-1 py-3 text-[10px] font-black rounded-full text-zinc-600 flex items-center justify-center gap-2 ${t==='manual'?'text-white bg-zinc-800':'text-zinc-600'}`;
    document.getElementById('box-file').style.display = t === 'file' ? 'block' : 'none';
    document.getElementById('box-manual').style.display = t === 'manual' ? 'block' : 'none';
    App.tab = t;
    showLoginError("");
}

async function performAuth() {
    let targetUid = "";
    let targetPass = "";

    if (App.tab === 'manual') { 
        targetUid = document.getElementById('in-uid').value.trim(); 
        targetPass = document.getElementById('in-pass').value.trim(); 
    } else {
        targetUid = App.fileUid ? App.fileUid.trim() : "";
        targetPass = App.filePass ? App.filePass.trim() : "";
    }
    
    if (!targetUid || !targetPass) {
        showLoginError(App.tab === 'manual' ? "UID AND PASSWORD ARE REQUIRED" : "PLEASE SELECT A VALID GUEST FILE FIRST");
        return;
    }
    
    showLoginError(""); 
    toggleLoader(true, "Getting account login");

    try {
        const res = await fetch(API_URL, {
            method:"POST",
            headers:{ 
                "Content-Type":"application/json",
                "X-Sec-Header": SECURE_HEADER_VALUE
            },
            body: JSON.stringify({
                action:"login",
                uid:targetUid,
                pass:targetPass,
                version:App.version
            })
        });
        
        const data = await res.json();
        if(res.ok && (data.status === "success" || data.account_info)) {
            App.uid = targetUid;
            App.pass = targetPass;
            App.aid = data.account_info.account_id; 
            App.nick = data.account_info.nickname; 
            App.reg = data.account_info.region;
            
            const remBox = document.getElementById('remember-me');
            if (remBox && remBox.checked) {
                localStorage.setItem("wishlist_remember", "true");
                localStorage.setItem("wishlist_uid", App.uid);
                localStorage.setItem("wishlist_pass", App.pass);
            } else {
                localStorage.setItem("wishlist_remember", "false");
                localStorage.removeItem("wishlist_uid");
                localStorage.removeItem("wishlist_pass");
            }

            localStorage.setItem("wishlist_session", JSON.stringify({
                uid: App.uid,
                pass: App.pass,
                aid: App.aid,
                nick: App.nick,
                reg: App.reg
            }));

            document.getElementById('res-nick').innerText = App.nick; 
            document.getElementById('res-uid').innerText = App.aid; 
            document.getElementById('res-reg').innerText = App.reg;
            document.getElementById('view-login').classList.add('hidden'); 
            document.getElementById('view-info').classList.remove('hidden');
        } else {
            showLoginError(data.message || "Invalid credentials.");
        }
    } catch(e) {
        showLoginError("Network connection error.");
    }
    toggleLoader(false);
}

function performLogout() {
    localStorage.removeItem("wishlist_session");
    location.reload();
}

async function toDash() {
    toggleLoader(true, "Getting wishlist info");
    await refreshGridData();
    document.getElementById('view-info').classList.add('hidden');
    document.getElementById('view-dash').classList.remove('hidden');
    document.getElementById('d-nick').innerText = App.nick;
    document.getElementById('d-uid-ghost').innerText = App.aid;
    document.getElementById('d-reg-badge').innerText = App.reg.toUpperCase();
    toggleLoader(false);
}

async function refreshGridData() {
    try {
        const response = await fetch(API_URL, {
            method: "POST",
            headers: { 
                "Content-Type": "application/json",
                "X-Sec-Header": SECURE_HEADER_VALUE
            },
            body: JSON.stringify({
                action: "wishlist",
                region: App.reg,
                aid: App.aid,
                version: App.version
            })
        });
        
        if (response.ok) {
            const res = await response.json();
            if (res && res.wishlist_items) {
                App.items = res.wishlist_items;
                document.getElementById('wish-grid').innerHTML = App.items.map(i => {
                    let itemId = parseItemId(i);
                    return itemId ? renderItemCard(itemId) : '';
                }).join('');
                updateCount();
            }
        }
    } catch(e) {
        console.error("Preserved layout on network delay", e);
    }
}

function renderItemCard(id) {
    let itemInfo = App.itemDb[id] || { rare: "WHITE", name: "Custom Item", icon: "" };
    let rare = itemInfo.rare || "WHITE";
    let name = itemInfo.name || "Item " + id;
    let isPlus = rare.toUpperCase().includes("PLUS");
    
    let cleanRare = rare.toUpperCase().replace("PLUS", "").replace(/[^A-Z]/g, "").trim();
    if (cleanRare === "ORANAGE") cleanRare = "ORANGE";
    
    let bgStyle = (!cleanRare || cleanRare === "NONE" || !rarityBase[cleanRare])
        ? "background-color: #080808; background-image: none;"
        : `background-image: url('${rarityBase[cleanRare]}');`;

    return `<div class="reward-card ${isPlus ? 'rare-plus' : ''}" id="card-${id}" style="${bgStyle}">
        ${getItemIconHTML(id)}
        <div class="id-bar flex flex-col items-center justify-center py-1">
            <span class="item-name text-[9px] text-white font-bold truncate max-w-full text-center px-1">${name}</span>
            <span class="id-label text-[8px] text-zinc-400 font-semibold font-mono tracking-wider">${id}</span>
        </div>
    </div>`;
}

function updateCount() { 
    document.getElementById('d-count').innerText = `${App.items.length.toString().padStart(2, '0')}/80`; 
}

async function secureRequest(mode, id, retries = 3) {
    for(let i = 0; i < retries; i++) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 12000); 
        
        try {
            const r = await fetch(API_URL, {
                method: "POST",
                headers: { 
                    "Content-Type":"application/json",
                    "X-Sec-Header": SECURE_HEADER_VALUE
                },
                signal: controller.signal,
                body: JSON.stringify({
                    action: "modify",
                    region: App.reg,
                    mode: mode,
                    id: id,
                    uid: App.uid,
                    pass: App.pass,
                    version: App.version
                })
            });
            clearTimeout(timeoutId);
            const data = await r.json();
            if(data.status === "success") return true;
        } catch(e) {
            clearTimeout(timeoutId);
        }
        await new Promise(res => setTimeout(res, 200)); 
    }
    return false;
}

// Seamless batch addition without unknown ID warnings or limitations
async function processRequest(mode) {
    const val = document.getElementById('item-id').value;
    let targets = parseSmartInput(val);
    if(!targets.length) return;

    if(mode === 'add' && App.items.length + targets.length > 80) { 
        updateStatus('error', 'WISHLIST IS FULL'); 
        return; 
    }
    updateStatus('process', 'Processing request...');
    
    let failedTargets = [...targets];
    let attempts = 0;
    const maxAttempts = 3; 

    while (failedTargets.length > 0 && attempts < maxAttempts) {
        if (attempts > 0) {
            updateStatus('process', `Retrying ${failedTargets.length} items...`);
        }
        
        const currentBatch = [...failedTargets];
        failedTargets = []; 
        let completed = 0;

        for (let id of currentBatch) {
            if (mode === 'rem') {
                const card = document.getElementById(`card-${id}`);
                if (card) card.classList.add('is-removing');
            }
            
            const success = await secureRequest(mode, id);
            if (success) {
                if (mode === 'add') {
                    if (!App.items.some(it => String(parseItemId(it)) === id)) {
                        document.getElementById('wish-grid').insertAdjacentHTML('afterbegin', renderItemCard(id));
                        App.items.push({ Id: parseInt(id) || id });
                    }
                } else {
                    const card = document.getElementById(`card-${id}`);
                    if (card) {
                        card.classList.add('is-deleting');
                        setTimeout(() => card.remove(), 350);
                    }
                    App.items = App.items.filter(it => String(parseItemId(it)) !== id);
                }
                updateCount();
            } else {
                const card = document.getElementById(`card-${id}`);
                if (card) card.classList.remove('is-removing');
                failedTargets.push(id); 
            }
            completed++;
            document.getElementById('p-fill').style.width = `${(completed / currentBatch.length) * 100}%`;
            await new Promise(res => setTimeout(res, 100));
        }
        attempts++;
    }

    await refreshGridData();

    if (failedTargets.length > 0) {
        updateStatus('error', `Done with ${failedTargets.length} failures.`);
    } else {
        updateStatus('success', 'Request Successful');
        document.getElementById('item-id').value = "";
    }
}

function parseRange(start, rangeVal) {
    let temp = [];
    if(rangeVal.length < 5) {
        let prefix = start.substring(0, start.length - rangeVal.length);
        let sNum = parseInt(start.substring(start.length - rangeVal.length)), eNum = parseInt(rangeVal);
        for(let i = Math.min(sNum, eNum); i <= Math.max(sNum, eNum); i++) {
            temp.push(prefix + i.toString().padStart(rangeVal.length, '0'));
        }
    } else { 
        for(let i = parseInt(start); i <= parseInt(rangeVal); i++) {
            temp.push(i.toString()); 
        }
    }
    return temp;
}

function parseSmartInput(v) {
    let ids = [];
    v.split(',').forEach(p => {
        p = p.trim();
        if (!p) return;
        
        let spaceParts = p.split(/\s+/);
        if (spaceParts.length === 2) {
            ids.push(...parseRange(spaceParts[0], spaceParts[1]));
        } 
        else if (p.includes('-')) {
            let hyphenParts = p.split('-');
            if (hyphenParts.length === 2) {
                ids.push(...parseRange(hyphenParts[0].trim(), hyphenParts[1].trim()));
            }
        } 
        else {
            ids.push(p);
        }
    });
    return [...new Set(ids)];
}

async function fullPurge() {
    closeModal('modal-wipe');
    const ids = App.items.map(item => parseItemId(item)).filter(Boolean);
    updateStatus('process', 'Processing wipe...');
    
    let failedIds = [...ids];
    let attempts = 0;
    const maxAttempts = 3;

    while (failedIds.length > 0 && attempts < maxAttempts) {
        const currentBatch = [...failedIds];
        failedIds = [];
        let done = 0;

        for (let id of currentBatch) {
            const card = document.getElementById(`card-${id}`);
            if (card) card.classList.add('is-removing');
            
            const success = await secureRequest('rem', id);
            if (success) {
                if (card) {
                    card.classList.add('is-deleting');
                    setTimeout(() => card.remove(), 350);
                }
                App.items = App.items.filter(it => String(parseItemId(it)) !== id);
            } else {
                if (card) card.classList.remove('is-removing');
                failedIds.push(id);
            }
            done++;
            document.getElementById('p-fill').style.width = `${(done / currentBatch.length) * 100}%`;
            updateCount();
            await new Promise(res => setTimeout(res, 100));
        }
        attempts++;
    }

    await refreshGridData();

    if (failedIds.length > 0) {
        updateStatus('error', `Wiped with ${failedIds.length} errors.`);
    } else {
        updateStatus('success', 'Request Successful');
    }
}

function switchDashboardMode(view) {
    App.currentView = view;
    
    const rowStandard = document.getElementById('row-standard');
    const rowSearch = document.getElementById('row-search');
    const rowLibrary = document.getElementById('row-library');
    const toggleSearchBtn = document.getElementById('btn-search-toggle');
    const toggleLibBtn = document.getElementById('btn-library-toggle');
    const searchStandardIcon = document.getElementById('icon-search-standard');
    const searchActiveIcon = document.getElementById('icon-search-active');
    const libStandardIcon = document.getElementById('icon-lib-standard');
    const libActiveIcon = document.getElementById('icon-lib-active');
    
    rowStandard.classList.add('hidden');
    rowSearch.classList.add('hidden');
    rowLibrary.classList.add('hidden');
    
    toggleSearchBtn.className = "w-12 h-12 flex items-center justify-center bg-zinc-900 border border-zinc-800 rounded-xl text-zinc-400 mr-2";
    toggleLibBtn.className = "w-12 h-12 flex items-center justify-center bg-zinc-900 border border-zinc-800 rounded-xl text-zinc-400 mr-2";
    
    searchStandardIcon.classList.add('hidden');
    searchActiveIcon.classList.add('hidden');
    libStandardIcon.classList.add('hidden');
    libActiveIcon.classList.add('hidden');
    
    if (view === "standard") {
        rowStandard.classList.remove('hidden');
        searchStandardIcon.classList.remove('hidden');
        toggleSearchBtn.className = "w-12 h-12 flex items-center justify-center bg-zinc-900 border border-zinc-800 rounded-xl text-[#ffde00] mr-2";
        libStandardIcon.classList.remove('hidden');
    } else if (view === "search") {
        rowSearch.classList.remove('hidden');
        toggleSearchBtn.className = "w-12 h-12 flex items-center justify-center bg-zinc-900 border border-zinc-800 rounded-xl text-[#ffde00] mr-2";
        searchActiveIcon.classList.remove('hidden');
        libStandardIcon.classList.remove('hidden');
    } else if (view === "library") {
        rowLibrary.classList.remove('hidden');
        toggleLibBtn.className = "w-12 h-12 flex items-center justify-center bg-zinc-900 border border-zinc-800 rounded-xl text-[#ffde00] mr-2";
        searchStandardIcon.classList.remove('hidden');
        libActiveIcon.classList.remove('hidden');
    }
}

function toggleSearchView() {
    switchDashboardMode(App.currentView === "search" ? "standard" : "search");
}

function toggleLibraryView() {
    switchDashboardMode(App.currentView === "library" ? "standard" : "library");
}

function openLibraryModal() {
    document.getElementById('lib-search-input').value = "";
    libraryFilteredItems = Object.keys(App.itemDb).map(id => ({
        id: id,
        name: App.itemDb[id].name,
        rare: App.itemDb[id].rare
    }));
    libraryRenderedCount = 0;
    selectedLibraryIds.clear();
    document.getElementById('lib-items-grid').innerHTML = "";
    renderNextLibraryPage();
    document.getElementById('modal-library').style.display = 'flex';
}

function renderNextLibraryPage() {
    const grid = document.getElementById('lib-items-grid');
    const nextBatch = libraryFilteredItems.slice(libraryRenderedCount, libraryRenderedCount + LIBRARY_PAGE_SIZE);
    
    if (nextBatch.length === 0) {
        document.getElementById('btn-lib-load-more').classList.add('hidden');
        return;
    }

    const html = nextBatch.map(item => renderLibraryItemCard(item.id)).join('');
    grid.insertAdjacentHTML('beforeend', html);
    libraryRenderedCount += nextBatch.length;

    if (libraryRenderedCount < libraryFilteredItems.length) {
        document.getElementById('btn-lib-load-more').classList.remove('hidden');
    } else {
        document.getElementById('btn-lib-load-more').classList.add('hidden');
    }
}

function loadMoreLibraryItems() { renderNextLibraryPage(); }

function filterLibraryItems() {
    const query = document.getElementById('lib-search-input').value.toLowerCase().trim();
    const allItems = Object.keys(App.itemDb).map(id => ({
        id: id,
        name: App.itemDb[id].name || "",
        rare: App.itemDb[id].rare || ""
    }));

    if (!query) {
        libraryFilteredItems = allItems;
    } else {
        libraryFilteredItems = allItems.filter(item => 
            item.id.includes(query) || 
            item.name.toLowerCase().includes(query) || 
            item.rare.toLowerCase().includes(query)
        );
    }

    libraryRenderedCount = 0;
    document.getElementById('lib-items-grid').innerHTML = "";
    renderNextLibraryPage();
}

function renderLibraryItemCard(id) {
    let isOwned = App.items.some(it => String(parseItemId(it)) === String(id));
    let itemInfo = App.itemDb[id] || { rare: "WHITE", name: "Item " + id };
    let rare = itemInfo.rare || "WHITE";
    let name = itemInfo.name || "Item " + id;
    let isSelected = selectedLibraryIds.has(id);
    let isPlus = rare.toUpperCase().includes("PLUS");
    let cleanRare = rare.toUpperCase().replace("PLUS", "").replace(/[^A-Z]/g, "").trim();
    if (cleanRare === "ORANAGE") cleanRare = "ORANGE";
    
    let bgStyle = (!cleanRare || cleanRare === "NONE" || !rarityBase[cleanRare])
        ? "background-color: #080808; background-image: none;"
        : `background-image: url('${rarityBase[cleanRare]}');`;

    return `
    <div id="lib-card-${id}" data-id="${id}" onclick="toggleLibraryCardSelect('${id}')" 
         class="reward-card cursor-pointer hover:scale-105 active:scale-95 transition-transform duration-200 ${isPlus ? 'rare-plus' : ''} ${isSelected ? 'is-selected' : ''}" 
         style="${bgStyle}">
        ${getItemIconHTML(id)}
        ${isOwned ? `
        <div class="absolute inset-0 bg-black/60 flex items-center justify-center z-50">
            <span class="bg-zinc-800 text-yellow-500 border border-yellow-500/30 text-[8px] font-black px-1.5 py-0.5 rounded uppercase">In List</span>
        </div>` : ''}
        <div class="id-bar flex flex-col items-center justify-center py-1">
            <span class="text-[8px] text-white font-bold truncate w-full text-center px-1">${name}</span>
            <span class="text-[6px] text-zinc-400 font-mono">${id}</span>
        </div>
    </div>`;
}

function toggleLibraryCardSelect(id) {
    const card = document.getElementById(`lib-card-${id}`);
    if (!card) return;
    
    if (selectedLibraryIds.has(id)) {
        selectedLibraryIds.delete(id);
        card.classList.remove('is-selected');
    } else {
        selectedLibraryIds.add(id);
        card.classList.add('is-selected');
    }
}

function selectAllLibraryItems() {
    const cards = document.querySelectorAll('#lib-items-grid .reward-card');
    cards.forEach(card => {
        const id = card.getAttribute('data-id');
        if (id && !selectedLibraryIds.has(id)) {
            selectedLibraryIds.add(id);
            card.classList.add('is-selected');
        }
    });
}

function deselectAllLibraryItems() {
    const cards = document.querySelectorAll('#lib-items-grid .reward-card');
    cards.forEach(card => {
        const id = card.getAttribute('data-id');
        if (id) {
            selectedLibraryIds.delete(id);
            card.classList.remove('is-selected');
        }
    });
}

function importSelectedLibraryItems() {
    if (selectedLibraryIds.size === 0) return;
    closeModal('modal-library');
    const idsToAdd = Array.from(selectedLibraryIds).join(', ');
    selectedLibraryIds.clear();
    document.getElementById('item-id').value = idsToAdd;
    switchDashboardMode("standard");
}

async function performLookup() {
    const searchUid = document.getElementById('search-uid').value.trim();
    if (!searchUid) return;
    
    toggleLoader(true, "Gathering wishlist items...");
    
    const regionsToSearch = ["ind", "bd", "sg", "br", "us", "eu", "pk", "id", "me", "tw"];
    let foundRegion = null;
    let foundItems = [];
    
    const searchPromises = regionsToSearch.map(async (reg) => {
        try {
            const res = await fetch(API_URL, {
                method: "POST",
                headers: { 
                    "Content-Type":"application/json",
                    "X-Sec-Header": SECURE_HEADER_VALUE
                },
                body: JSON.stringify({
                    action: "wishlist",
                    region: reg,
                    aid: searchUid,
                    version: App.version
                })
            });
            const data = await res.json();
            if (data && data.wishlist_items && data.wishlist_items.length > 0) {
                return { region: reg.toUpperCase(), items: data.wishlist_items };
            }
        } catch(e) {}
        return null;
    });
    
    try {
        const results = await Promise.all(searchPromises);
        const match = results.find(r => r !== null);
        if (match) {
            foundRegion = match.region;
            foundItems = match.items;
        }
    } catch(e) {}
    
    toggleLoader(false);
    
    if (foundRegion && foundItems.length > 0) {
        document.getElementById('modal-search-reg').innerText = foundRegion;
        document.getElementById('modal-search-uid').innerText = searchUid;
        selectedSearchIds.clear();
        
        const resultsGrid = document.getElementById('search-results-grid');
        resultsGrid.innerHTML = foundItems.map(i => {
            let id = parseItemId(i);
            return id ? renderSearchItemCard(id) : '';
        }).join('');
        
        document.getElementById('modal-search-results').style.display = 'flex';
    } else {
        alert("No wishlist found for this UID in any region.");
    }
}

function importSelectedItems() {
    if (selectedSearchIds.size === 0) return;
    closeModal('modal-search-results');
    const idsToAdd = Array.from(selectedSearchIds).join(', ');
    selectedSearchIds.clear();
    document.getElementById('item-id').value = idsToAdd;
    switchDashboardMode("standard");
}

function renderSearchItemCard(id) {
    let isOwned = App.items.some(it => String(parseItemId(it)) === String(id));
    let itemInfo = App.itemDb[id] || { rare: "WHITE", name: "Item " + id };
    let rare = itemInfo.rare || "WHITE";
    let name = itemInfo.name || "Item " + id;
    let isSelected = selectedSearchIds.has(id);
    let isPlus = rare.toUpperCase().includes("PLUS");
    let cleanRare = rare.toUpperCase().replace("PLUS", "").replace(/[^A-Z]/g, "").trim();
    if (cleanRare === "ORANAGE") cleanRare = "ORANGE";
    
    let bgStyle = (!cleanRare || cleanRare === "NONE" || !rarityBase[cleanRare])
        ? "background-color: #080808; background-image: none;"
        : `background-image: url('${rarityBase[cleanRare]}');`;

    return `
    <div class="reward-card ${isPlus ? 'rare-plus' : ''} ${isOwned ? 'opacity-50 pointer-events-none' : 'cursor-pointer search-card'}" 
         id="search-card-${id}" data-id="${id}" onclick="toggleSearchCardSelect('${id}')" style="${bgStyle}">
        ${getItemIconHTML(id)}
        ${isOwned ? `<div class="absolute inset-0 bg-black/60 flex items-center justify-center z-50"><span class="bg-zinc-800 text-yellow-500 border border-yellow-500/30 text-[8px] font-black px-1.5 py-0.5 rounded uppercase">In List</span></div>` : ''}
        <div class="id-bar flex flex-col items-center justify-center py-1">
            <span class="item-name text-[8px] text-white font-bold truncate max-w-full text-center px-1">${name}</span>
            <span class="id-label text-[7px] text-zinc-400 font-mono">${id}</span>
        </div>
    </div>`;
}

function toggleSearchCardSelect(id) {
    const card = document.getElementById(`search-card-${id}`);
    if (!card || card.classList.contains('pointer-events-none')) return;
    if (selectedSearchIds.has(id)) {
        selectedSearchIds.delete(id);
        card.classList.remove('is-selected');
    } else {
        selectedSearchIds.add(id);
        card.classList.add('is-selected');
    }
}

function selectAllSearchItems() {
    const cards = document.querySelectorAll('.search-card');
    cards.forEach(card => {
        const id = card.getAttribute('data-id');
        if (!selectedSearchIds.has(id)) {
            selectedSearchIds.add(id);
            card.classList.add('is-selected');
        }
    });
}

function deselectAllSearchItems() {
    const cards = document.querySelectorAll('.search-card');
    cards.forEach(card => {
        const id = card.getAttribute('data-id');
        selectedSearchIds.delete(id);
        card.classList.remove('is-selected');
    });
}

function toggleLoader(s, text = "Processing") { 
    document.getElementById('kelly-loader').style.display = s?'flex':'none'; 
    document.getElementById('kelly-text').innerText = text; 
}
function openWipeModal() { 
    if(App.items.length) document.getElementById('modal-wipe').style.display = 'flex'; 
}
function openLogoutModal() { 
    document.getElementById('modal-logout').style.display = 'flex'; 
}
function closeModal(id) { 
    document.getElementById(id).style.display = 'none'; 
}
function updateStatus(type, msg) {
    const box = document.getElementById('status-box');
    box.className = `status-window active`;
    document.getElementById('status-text').innerText = msg;
    document.getElementById('status-icon').innerHTML = SVGS[type];
    if(type !== 'process') setTimeout(() => { box.className = 'status-window'; document.getElementById('p-fill').style.width='0%'; }, 3500);
}
switchTab('file');