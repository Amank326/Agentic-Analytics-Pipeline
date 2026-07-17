let salesData = [];
let filteredData = [];
let currentSortColumn = 'order_id';
let isSortAsc = true;
let datasetClassification = 'Retail Store Sales';
let qualityScore = 100;

// Quality metrics tracking
let cleaningMetrics = {
    duplicates: 0,
    nulls: 0,
    formats: 0,
    outliers: 0
};

// SQL.js global instances
let SQLInstance = null;
let dbInstance = null;

// ECharts instances
let dynamicChartInstance = null;
let subcatChartInstance = null;
let regionChartInstance = null;

let GEMINI_API_KEY = "";

// Tab Routing Configuration
const tabMeta = {
    'overview': { title: 'Enterprise Analytics Overview', subtitle: 'Real-time metrics, data cleaning, and relational SQL queries' },
    'cleaning': { title: 'Cleaning & Quality Assurance', subtitle: 'Detailed ingestion records, anomaly flags, and data engineering transformations' },
    'eda': { title: 'Interactive Exploratory Data Analysis', subtitle: 'Dynamic visual graphics powered by Apache ECharts' },
    'sql': { title: 'In-Browser SQL Playground', subtitle: 'Execute custom relational queries on the active dataset in real-time' },
    'powerbi': { title: 'Power BI Dashboard Specifications', subtitle: 'Blueprint design, DAX measures, and visual hierarchy guidelines' },
    'ai-copilot': { title: 'AI Sales Copilot', subtitle: 'Generative AI insights powered by Google Gemini 1.5 Flash' },
    'downloads': { title: 'Download Cleaned Assets', subtitle: 'Exported excel and database spreadsheet formats' }
};

function switchTab(tabId, btnElement) {
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.remove('active');
    });

    document.querySelectorAll('.sidebar-menu .menu-item').forEach(btn => {
        btn.classList.remove('active');
    });

    document.getElementById(`tab-${tabId}`).classList.add('active');
    btnElement.classList.add('active');

    if (tabMeta[tabId]) {
        document.getElementById('dashboard-title').innerText = tabMeta[tabId].title;
        document.getElementById('dashboard-subtitle').innerText = tabMeta[tabId].subtitle;
    }

    // Resize ECharts on tab switch to avoid zero-width bugs
    if (tabId === 'eda') {
        setTimeout(resizeCharts, 50);
    }
}

// =====================================================================
// SQL.JS DATABASE INITIALIZATION
// =====================================================================
initSqlJs({
    locateFile: file => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.12.0/${file}`
}).then(sql => {
    SQLInstance = sql;
    console.log("SQL.js successfully loaded.");
    document.getElementById('db-status-label').innerText = "SQL_DB: INITIALIZED";
    // Load default dataset
    loadDefaultData();
}).catch(err => {
    console.error("SQL.js initialization failed:", err);
    document.getElementById('db-status-label').innerText = "SQL_DB: LOAD_FAILED";
    loadDefaultData(); // Fallback to normal loading if WASM is blocked
});

function loadDefaultData() {
    // Fetch local config first
    fetch('config.json')
        .then(r => {
            if (r.ok) return r.json();
            throw new Error("No config.json");
        })
        .then(cfg => {
            GEMINI_API_KEY = cfg.apiKey;
        })
        .catch(e => {
            console.log("Using empty/default API key.");
        });

    fetch('sales_data.json')
        .then(response => {
            if (!response.ok) throw new Error("HTTP error " + response.status);
            return response.json();
        })
        .then(data => {
            processNewDataset(data, 'sales_data.json');
        })
        .catch(error => {
            console.error("Error loading default sales data:", error);
        });
}

function processNewDataset(rawData, filename) {
    // 1. Classify Dataset Type
    datasetClassification = classifyDataset(rawData);
    document.getElementById('dataset-classification-tag').innerText = datasetClassification.toUpperCase();

    // 2. Normalize and Clean Data
    cleaningMetrics = { duplicates: 0, nulls: 0, formats: 0, outliers: 0 };
    const cleaned = cleanAndAnalyzeData(rawData);
    salesData = cleaned;
    filteredData = [...salesData];

    // Update quality elements
    document.getElementById('metrics-duplicates').innerText = cleaningMetrics.duplicates;
    document.getElementById('metrics-nulls').innerText = cleaningMetrics.nulls;
    document.getElementById('metrics-formats').innerText = cleaningMetrics.formats;
    document.getElementById('metrics-outliers').innerText = cleaningMetrics.outliers;
    
    // Quality Score Calculation
    qualityScore = calculateQualityScore(rawData.length);
    document.getElementById('quality-score-value').innerText = `${qualityScore}%`;
    document.getElementById('cleaning-meta-rows').innerText = `Clean rows processed: ${salesData.length}`;

    // 3. Initialize In-Memory SQL.js DB
    populateInMemoryDB();

    // 4. Reset & Render
    initDashboard();
}

function initDashboard() {
    const searchInput = document.getElementById('search-input');
    if (searchInput) {
        searchInput.replaceWith(searchInput.cloneNode(true)); // Clear previous listeners
        document.getElementById('search-input').addEventListener('input', filterData);
    }
    updateFilterDropdowns();
    renderTable();
    updateKPIs();
    initECharts();
}

// =====================================================================
// DATA CLEANING ENGINE & FEATURE ENGINEERING
// =====================================================================
function classifyDataset(data) {
    if (!data || data.length === 0) return 'Generic Data';
    const sample = data[0];
    const keys = Object.keys(sample).map(k => k.toLowerCase());

    if (keys.some(k => k.includes('sales') || k.includes('profit') || k.includes('order'))) return 'Retail Store Sales';
    if (keys.some(k => k.includes('patient') || k.includes('hospital') || k.includes('clinical'))) return 'Healthcare';
    if (keys.some(k => k.includes('employee') || k.includes('salary') || k.includes('hr'))) return 'HR Analytics';
    if (keys.some(k => k.includes('stock') || k.includes('inventory') || k.includes('warehouse'))) return 'Inventory Management';
    return 'Business Metrics';
}

function cleanAndAnalyzeData(rawData) {
    const seen = new Set();
    const cleaned = [];

    // Outliers threshold extraction
    const salesValues = rawData.map(r => parseFloat(r.sales || r.revenue || 0)).filter(v => v > 0);
    let meanSales = 0;
    let stdSales = 0;
    if (salesValues.length > 0) {
        meanSales = salesValues.reduce((sum, v) => sum + v, 0) / salesValues.length;
        const squareDiffs = salesValues.map(v => Math.pow(v - meanSales, 2));
        stdSales = Math.sqrt(squareDiffs.reduce((sum, v) => sum + v, 0) / salesValues.length);
    }

    rawData.forEach((row, i) => {
        // Detect duplicates
        const rowString = JSON.stringify(row);
        if (seen.has(rowString)) {
            cleaningMetrics.duplicates++;
            return; // Skip duplicate
        }
        seen.add(rowString);

        // Normalize headers
        const norm = normalizeRow(row, i);

        // Check for missing values & fill intelligently
        if (!row.customer_name && !row.customer) {
            cleaningMetrics.nulls++;
        }
        if (isNaN(norm.sales) || norm.sales === 0) {
            cleaningMetrics.nulls++;
            norm.sales = meanSales || 100.0; // Fill with mean
        }

        // Outlier detection (Z-Score method)
        if (stdSales > 0) {
            const zScore = Math.abs((norm.sales - meanSales) / stdSales);
            if (zScore > 2.5) {
                cleaningMetrics.outliers++;
            }
        }

        // Standardize formats (strip currency signs, format dates)
        if (typeof row.sales === 'string' && (row.sales.includes('$') || row.sales.includes(','))) {
            cleaningMetrics.formats++;
        }

        cleaned.push(norm);
    });

    return cleaned;
}

function calculateQualityScore(total) {
    if (total === 0) return 0;
    const errors = cleaningMetrics.duplicates + cleaningMetrics.nulls + cleaningMetrics.formats;
    const score = Math.max(0, Math.min(100, Math.round(((total - errors) / total) * 100)));
    return score;
}

// =====================================================================
// MEMORY DATABASE SCHEMA POPULATION
// =====================================================================
function populateInMemoryDB() {
    if (!SQLInstance) return;
    try {
        dbInstance = new SQLInstance.Database();
        
        // DDL Statement
        dbInstance.run(`
            CREATE TABLE store_sales (
                order_id INTEGER PRIMARY KEY,
                order_date TEXT,
                customer_name TEXT,
                category TEXT,
                sub_category TEXT,
                sales REAL,
                profit REAL,
                quantity INTEGER,
                region TEXT
            );
        `);

        // Insert cleaned records in batches
        const stmt = dbInstance.prepare("INSERT INTO store_sales VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");
        salesData.forEach(row => {
            stmt.run([
                row.order_id,
                row.order_date,
                row.customer_name,
                row.category,
                row.sub_category,
                row.sales,
                row.profit,
                row.quantity,
                row.region
            ]);
        });
        stmt.free();

        document.getElementById('db-status-label').innerText = `SQL_DB: ${salesData.length}_ROWS_LOADED`;
        console.log("In-memory SQLite populated.");
    } catch(err) {
        console.error("Failed to populate SQL.js DB:", err);
    }
}

// =====================================================================
// PLAYGROUND SQL RUNNER
// =====================================================================
function executeSQLPlayground() {
    const editor = document.getElementById('sql-query-editor');
    const query = editor.value.trim();
    if (!query) return;

    if (!dbInstance) {
        alert("SQL.js Database Engine is not initialized yet.");
        return;
    }

    try {
        const res = dbInstance.exec(query);
        const countBadge = document.getElementById('playground-results-count');
        const head = document.getElementById('playground-table-head');
        const body = document.getElementById('playground-table-body');

        if (res.length === 0) {
            countBadge.innerText = "0 Rows Returned";
            head.innerHTML = "<tr><th>Status</th></tr>";
            body.innerHTML = "<tr><td>Query executed successfully, returned no columns.</td></tr>";
            return;
        }

        const columns = res[0].columns;
        const values = res[0].values;

        countBadge.innerText = `${values.length} Rows Returned`;

        // Render headers
        head.innerHTML = "<tr>" + columns.map(c => `<th>${c}</th>`).join('') + "</tr>";

        // Render rows
        body.innerHTML = values.map(row => {
            return "<tr>" + row.map(val => {
                let cellVal = val === null ? '<span style="color: var(--text-muted);">NULL</span>' : val;
                if (typeof val === 'number') {
                    if (val % 1 !== 0) {
                        cellVal = val.toFixed(2);
                    }
                }
                return `<td>${cellVal}</td>`;
            }).join('') + "</tr>";
        }).join('');

    } catch (err) {
        console.error("SQL Execution Error:", err);
        document.getElementById('playground-results-count').innerText = "Execution Error";
        document.getElementById('playground-table-head').innerHTML = "<tr><th style='color: #f87171;'>SQL Exception</th></tr>";
        document.getElementById('playground-table-body').innerHTML = `<tr><td style="color: #f87171; white-space: pre-wrap; font-family: monospace;">${err.message}</td></tr>`;
    }
}

// =====================================================================
// APACHE ECHARTS GRAPHICS RENDER
// =====================================================================
function initECharts() {
    // Destroy previous charts if active
    if (dynamicChartInstance) dynamicChartInstance.dispose();
    if (subcatChartInstance) subcatChartInstance.dispose();
    if (regionChartInstance) regionChartInstance.dispose();

    const scatterEl = document.getElementById('echarts-dynamic-chart');
    const barEl = document.getElementById('echarts-subcat-chart');
    const pieEl = document.getElementById('echarts-region-chart');

    if (!scatterEl || !barEl || !pieEl) return;

    dynamicChartInstance = echarts.init(scatterEl, 'dark');
    subcatChartInstance = echarts.init(barEl, 'dark');
    regionChartInstance = echarts.init(pieEl, 'dark');

    // 1. Render Scatter Plot
    const scatterData = filteredData.map(r => [r.sales, r.profit, r.customer_name]);
    dynamicChartInstance.setOption({
        backgroundColor: 'transparent',
        grid: { top: 40, bottom: 40, left: 50, right: 20 },
        tooltip: {
            formatter: params => `<strong>${params.data[2]}</strong><br>Sales: $${params.data[0].toFixed(2)}<br>Profit: $${params.data[1].toFixed(2)}`
        },
        xAxis: { type: 'value', name: 'Sales', splitLine: { lineStyle: { color: 'rgba(255,255,255,0.05)' } } },
        yAxis: { type: 'value', name: 'Profit', splitLine: { lineStyle: { color: 'rgba(255,255,255,0.05)' } } },
        series: [{
            type: 'scatter',
            data: scatterData,
            itemStyle: { color: '#818cf8', opacity: 0.8 },
            symbolSize: 10
        }]
    });

    // 2. Render Sub-Category Revenue Bar Chart
    const subcatMap = {};
    filteredData.forEach(r => {
        if (!subcatMap[r.sub_category]) subcatMap[r.sub_category] = { sales: 0, profit: 0 };
        subcatMap[r.sub_category].sales += r.sales;
        subcatMap[r.sub_category].profit += r.profit;
    });

    const subcats = Object.keys(subcatMap);
    const subcatSales = subcats.map(s => subcatMap[s].sales);
    const subcatProfits = subcats.map(s => subcatMap[s].profit);

    subcatChartInstance.setOption({
        backgroundColor: 'transparent',
        grid: { top: 40, bottom: 40, left: 65, right: 20 },
        tooltip: { trigger: 'axis' },
        xAxis: { type: 'category', data: subcats, axisLabel: { interval: 0, rotate: 30 } },
        yAxis: { type: 'value', splitLine: { lineStyle: { color: 'rgba(255,255,255,0.05)' } } },
        series: [
            { name: 'Sales', type: 'bar', data: subcatSales, itemStyle: { color: '#6366f1' } },
            { name: 'Profit', type: 'bar', data: subcatProfits, itemStyle: { color: '#10b981' } }
        ]
    });

    // 3. Render Region Contribution Pie
    const regionMap = {};
    filteredData.forEach(r => {
        regionMap[r.region] = (regionMap[r.region] || 0) + r.sales;
    });

    const pieData = Object.keys(regionMap).map(reg => ({ name: reg, value: regionMap[reg] }));

    regionChartInstance.setOption({
        backgroundColor: 'transparent',
        tooltip: { trigger: 'item', formatter: '{b}: ${c} ({d}%)' },
        legend: { bottom: 0, left: 'center' },
        series: [{
            type: 'pie',
            radius: ['40%', '70%'],
            avoidLabelOverlap: false,
            itemStyle: { borderRadius: 10, borderColor: '#0b0f1d', borderWidth: 2 },
            label: { show: false },
            data: pieData
        }]
    });
}

function resizeCharts() {
    if (dynamicChartInstance) dynamicChartInstance.resize();
    if (subcatChartInstance) subcatChartInstance.resize();
    if (regionChartInstance) regionChartInstance.resize();
}

window.addEventListener('resize', resizeCharts);

// =====================================================================
// DATA NORMALIZATION & COMPILING
// =====================================================================
function updateKPIs() {
    let totalSales = 0;
    let totalProfit = 0;
    let totalQuantity = 0;

    filteredData.forEach(row => {
        totalSales += parseFloat(row.sales || 0);
        totalProfit += parseFloat(row.profit || 0);
        totalQuantity += parseInt(row.quantity || 0);
    });

    const marginPercent = totalSales > 0 ? (totalProfit / totalSales) * 100 : 0;

    document.getElementById('kpi-sales').innerText = formatCurrency(totalSales);
    document.getElementById('kpi-profit').innerText = formatCurrency(totalProfit);
    document.getElementById('kpi-margin').innerText = marginPercent.toFixed(2) + "%";
    document.getElementById('kpi-quantity').innerText = totalQuantity.toLocaleString();
    
    document.getElementById('record-count').innerText = `${filteredData.length} Records`;
}

function renderTable() {
    const tbody = document.getElementById('data-table-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (filteredData.length === 0) {
        tbody.innerHTML = `<tr><td colspan="9" style="text-align: center; color: var(--text-secondary);">No records found matching filters</td></tr>`;
        return;
    }

    filteredData.slice(0, 50).forEach(row => {
        const tr = document.createElement('tr');
        const profitClass = parseFloat(row.profit || 0) >= 0 ? 'positive-profit' : 'negative-profit';
        
        let formattedDate = row.order_date;
        try {
            formattedDate = new Date(row.order_date).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
            if (formattedDate === 'Invalid Date') formattedDate = row.order_date;
        } catch(e) {}

        tr.innerHTML = `
            <td>#${row.order_id}</td>
            <td>${formattedDate}</td>
            <td>${row.customer_name}</td>
            <td><span class="badge" style="background: rgba(255,255,255,0.05); color: var(--text-primary); border-radius: 6px;">${row.category}</span></td>
            <td>${row.sub_category}</td>
            <td>${formatCurrency(row.sales)}</td>
            <td class="${profitClass}">${formatCurrency(row.profit)}</td>
            <td>${row.quantity}</td>
            <td>${row.region}</td>
        `;
        tbody.appendChild(tr);
    });
}

function filterData() {
    const searchVal = document.getElementById('search-input').value.toLowerCase();
    const catVal = document.getElementById('filter-category').value;
    const regionVal = document.getElementById('filter-region').value;

    filteredData = salesData.filter(row => {
        const matchesSearch = (row.customer_name || '').toString().toLowerCase().includes(searchVal);
        const matchesCategory = catVal === 'All' || (row.category || '') === catVal;
        const matchesRegion = regionVal === 'All' || (row.region || '') === regionVal;

        return matchesSearch && matchesCategory && matchesRegion;
    });

    sortData(currentSortColumn, false);
    renderTable();
    updateKPIs();
}

function sortData(column, toggle = true) {
    if (toggle) {
        if (currentSortColumn === column) {
            isSortAsc = !isSortAsc;
        } else {
            currentSortColumn = column;
            isSortAsc = true;
        }
    }

    filteredData.sort((a, b) => {
        let valA = a[column];
        let valB = b[column];

        if (column === 'order_date') {
            valA = new Date(valA || 0);
            valB = new Date(valB || 0);
        } else if (column === 'sales' || column === 'profit' || column === 'order_id' || column === 'quantity') {
            valA = parseFloat(valA || 0);
            valB = parseFloat(valB || 0);
        } else {
            valA = (valA || '').toString().toLowerCase();
            valB = (valB || '').toString().toLowerCase();
        }

        if (valA < valB) return isSortAsc ? -1 : 1;
        if (valA > valB) return isSortAsc ? 1 : -1;
        return 0;
    });

    renderTable();
}

function resetFilters() {
    const searchInput = document.getElementById('search-input');
    if (searchInput) searchInput.value = '';
    
    const catSelect = document.getElementById('filter-category');
    if (catSelect) catSelect.value = 'All';

    const regSelect = document.getElementById('filter-region');
    if (regSelect) regSelect.value = 'All';

    filteredData = [...salesData];
    currentSortColumn = 'order_id';
    isSortAsc = true;
    sortData('order_id', false);
    renderTable();
    updateKPIs();
}

function formatCurrency(val) {
    const num = parseFloat(val || 0);
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD'
    }).format(num);
}

function updateFilterDropdowns() {
    const categorySelect = document.getElementById('filter-category');
    const regionSelect = document.getElementById('filter-region');

    if (!categorySelect || !regionSelect) return;

    const uniqueCategories = new Set();
    const uniqueRegions = new Set();

    salesData.forEach(row => {
        if (row.category) uniqueCategories.add(row.category);
        if (row.region) uniqueRegions.add(row.region);
    });

    categorySelect.innerHTML = '<option value="All">All Categories</option>';
    uniqueCategories.forEach(cat => {
        categorySelect.innerHTML += `<option value="${cat}">${cat}</option>`;
    });

    regionSelect.innerHTML = '<option value="All">All Regions</option>';
    uniqueRegions.forEach(reg => {
        regionSelect.innerHTML += `<option value="${reg}">${reg}</option>`;
    });
}

// =====================================================================
// FILE INGESTION (CSV, TSV, JSON, XML, EXCEL, SQLITE)
// =====================================================================
function handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    const extension = file.name.split('.').pop().toLowerCase();
    const reader = new FileReader();

    if (extension === 'xlsx' || extension === 'xls') {
        reader.onload = function(e) {
            try {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                const sheetName = workbook.SheetNames[0];
                const sheet = workbook.Sheets[sheetName];
                const rawJson = XLSX.utils.sheet_to_json(sheet, { defval: "" });
                processNewDataset(rawJson, file.name);
            } catch (err) {
                alert("Error parsing Excel file: " + err.message);
            }
        };
        reader.readAsArrayBuffer(file);
    } else if (extension === 'db' || extension === 'sqlite') {
        reader.onload = function(e) {
            try {
                if (!SQLInstance) throw new Error("SQL.js is not loaded.");
                const uInt8Array = new Uint8Array(e.target.result);
                const customDb = new SQLInstance.Database(uInt8Array);
                
                // Get first user table
                const tables = customDb.exec("SELECT name FROM sqlite_master WHERE type='table' AND name != 'sqlite_sequence';");
                if (tables.length === 0 || tables[0].values.length === 0) {
                    throw new Error("No tables found in SQLite database file.");
                }

                const tableName = tables[0].values[0][0];
                const records = customDb.exec(`SELECT * FROM ${tableName}`);
                
                if (records.length === 0) throw new Error(`Table ${tableName} is empty.`);
                
                const columns = records[0].columns;
                const rows = records[0].values.map(vals => {
                    const obj = {};
                    columns.forEach((col, idx) => {
                        obj[col] = vals[idx];
                    });
                    return obj;
                });

                dbInstance = customDb; // Swap databases
                processNewDataset(rows, file.name);
            } catch (err) {
                alert("Error loading SQLite file: " + err.message);
            }
        };
        reader.readAsArrayBuffer(file);
    } else if (extension === 'json') {
        reader.onload = function(e) {
            try {
                const rawJson = JSON.parse(e.target.result);
                const rows = Array.isArray(rawJson) ? rawJson : [rawJson];
                processNewDataset(rows, file.name);
            } catch (err) {
                alert("Error parsing JSON file: " + err.message);
            }
        };
        reader.readAsText(file);
    } else if (extension === 'xml') {
        reader.onload = function(e) {
            try {
                const parser = new DOMParser();
                const xmlDoc = parser.parseFromString(e.target.result, "text/xml");
                const root = xmlDoc.documentElement;
                const rows = [];
                
                // Simple XML structure parsing
                const records = root.children;
                for (let i = 0; i < records.length; i++) {
                    const item = records[i];
                    const obj = {};
                    for (let j = 0; j < item.children.length; j++) {
                        const child = item.children[j];
                        obj[child.tagName] = child.textContent;
                    }
                    rows.push(obj);
                }
                processNewDataset(rows, file.name);
            } catch (err) {
                alert("Error parsing XML: " + err.message);
            }
        };
        reader.readAsText(file);
    } else {
        // Fallback to CSV / TSV text parser
        reader.onload = function(e) {
            try {
                const text = e.target.result;
                Papa.parse(text, {
                    header: true,
                    skipEmptyLines: true,
                    complete: function(results) {
                        if (results.errors.length > 0) {
                            console.warn("CSV parse warnings:", results.errors);
                        }
                        processNewDataset(results.data, file.name);
                    }
                });
            } catch (err) {
                alert("Error parsing CSV text file: " + err.message);
            }
        };
        reader.readAsText(file);
    }
}

function normalizeRow(row, index) {
    const keys = {};
    Object.keys(row).forEach(k => {
        keys[k.toLowerCase().trim().replace(/ /g, '_')] = row[k];
    });

    let cleanSales = keys.sales || keys.revenue || keys.amount || 0;
    if (typeof cleanSales === 'string') {
        cleanSales = cleanSales.replace('$', '').replace(/,/g, '');
    }
    
    let cleanProfit = keys.profit || keys.earnings || keys.margin || 0;
    if (typeof cleanProfit === 'string') {
        cleanProfit = cleanProfit.replace('$', '').replace(/,/g, '');
    }

    return {
        order_id: parseInt(keys.order_id || keys.id || index + 1000),
        order_date: keys.order_date || keys.date || new Date().toISOString().split('T')[0],
        customer_name: keys.customer_name || keys.customer || keys.name || 'Unknown',
        category: keys.category || 'General',
        sub_category: keys.sub_category || keys.subcategory || 'General',
        sales: parseFloat(cleanSales),
        profit: parseFloat(cleanProfit),
        quantity: parseInt(keys.quantity || keys.qty || keys.count || 1),
        region: keys.region || keys.location || 'Unknown'
    };
}

// =====================================================================
// DYNAMIC AI CHAT ENGINE
// =====================================================================
function handleChatKey(e) {
    if (e.key === 'Enter') {
        sendChatMessage();
    }
}

function sendSuggestion(text) {
    document.getElementById('chat-input').value = text;
    sendChatMessage();
}

function appendMessage(text, type) {
    const messagesContainer = document.getElementById('chat-messages');
    if (!messagesContainer) return;
    
    const msgDiv = document.createElement('div');
    msgDiv.className = `message ${type}-message`;
    msgDiv.innerHTML = `<p style="font-size: 0.85rem; line-height: 1.5; color: var(--text-primary); white-space: pre-wrap;">${text}</p>`;
    messagesContainer.appendChild(msgDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function sendChatMessage() {
    const input = document.getElementById('chat-input');
    const userMessage = input.value.trim();
    if (!userMessage) return;

    input.value = '';
    appendMessage(userMessage, 'user');

    appendMessage("Studying transaction metrics...", "system");
    const lastMsgNode = document.getElementById('chat-messages').lastChild;

    // Prepare context metrics
    let totalSales = 0;
    let totalProfit = 0;
    let totalOrders = salesData.length;
    salesData.forEach(row => {
        totalSales += parseFloat(row.sales || 0);
        totalProfit += parseFloat(row.profit || 0);
    });
    const marginPercent = totalSales > 0 ? (totalProfit / totalSales) * 100 : 0;

    const dataContext = salesData.slice(0, 30).map(r => ({
        id: r.order_id,
        date: r.order_date,
        cust: r.customer_name,
        cat: r.category,
        subcat: r.sub_category,
        sales: r.sales,
        profit: r.profit,
        qty: r.quantity,
        region: r.region
    }));

    const systemPrompt = `You are the AI Sales Copilot for a dynamic Enterprise Data Analytics Dashboard.
Here is the core summary metrics of the CURRENT ACTIVE dataset:
- Total Sales: $${totalSales.toFixed(2)}
- Total Profit: $${totalProfit.toFixed(2)}
- Average Profit Margin: ${marginPercent.toFixed(2)}%
- Total Orders: ${totalOrders}

Here is a sample of up to 30 transactions from the database:
${JSON.stringify(dataContext)}

Answer the user's question based on this data. Highlight patterns, anomalies, and recommend actions. Keep answers professional and business-focused. User question: "${userMessage}"`;

    fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${GEMINI_API_KEY}`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            contents: [{
                parts: [{
                    text: systemPrompt
                }]
            }]
        })
    })
    .then(response => {
        if (!response.ok) {
            return response.json().then(err => { throw err; });
        }
        return response.json();
    })
    .then(resData => {
        if (resData.candidates && resData.candidates[0] && resData.candidates[0].content && resData.candidates[0].content.parts[0]) {
            const reply = resData.candidates[0].content.parts[0].text;
            lastMsgNode.innerHTML = `<p style="font-size: 0.85rem; line-height: 1.5; color: var(--text-primary); white-space: pre-wrap;">${reply}</p>`;
        } else {
            lastMsgNode.innerHTML = `<p style="font-size: 0.85rem; line-height: 1.5; color: var(--text-primary);">Could not parse Gemini API response.</p>`;
        }
    })
    .catch(error => {
        console.error("Gemini API Error:", error);
        let errorMsg = "";
        
        if (error.error && error.error.message) {
            errorMsg = error.error.message;
        } else if (error instanceof TypeError) {
            errorMsg = "Network error. If you have an Ad-blocker or Brave Shields enabled, please disable it for this site because it may block direct requests to Google's Gemini API server (generativelanguage.googleapis.com).";
        } else {
            errorMsg = "Please verify that your Gemini API key is valid and active.";
        }
        
        lastMsgNode.innerHTML = `<p style="font-size: 0.85rem; line-height: 1.5; color: #f87171;">Error: ${errorMsg}</p>`;
    });
}
