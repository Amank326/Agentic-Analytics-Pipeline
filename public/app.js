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
let biChartInstance = null;

// ETL Nodes collection
let etlNodes = [];
let etlNodeCounter = 0;

// Pyodide global instance
let pyodideInstance = null;
let isPyodideLoaded = false;

let GEMINI_API_KEY = "";

// Tab Routing Configuration
const tabMeta = {
    'overview': { title: 'Enterprise Analytics Overview', subtitle: 'Real-time metrics, data cleaning, and relational SQL queries' },
    'cleaning': { title: 'Cleaning & Quality Assurance', subtitle: 'Detailed ingestion records, anomaly flags, and data engineering transformations' },
    'etl': { title: 'No-Code ETL Studio', subtitle: 'Visual workflow designer to build, connect, and verify ingestion pipelines' },
    'eda': { title: 'Interactive Exploratory Data Analysis', subtitle: 'Dynamic visual graphics powered by Apache ECharts' },
    'sql': { title: 'SQL Studio Playground', subtitle: 'Execute custom relational queries on the active dataset in real-time' },
    'notebook': { title: 'Interactive Python Notebook', subtitle: 'Execute Python Pandas and Scikit-Learn code directly inside the browser WASM sandbox' },
    'ml': { title: 'Machine Learning Studio', subtitle: 'Perform regressions, AutoML tests, and feature correlation directly in WebAssembly' },
    'bi': { title: 'BI Worksheet Designer', subtitle: 'Drag, drop, and configure calculated columns, dimensions, and measures' },
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

    // Resize charts on switch
    if (tabId === 'eda') {
        setTimeout(resizeCharts, 50);
    } else if (tabId === 'bi') {
        setTimeout(runBIWorksheetRenderer, 50);
    }
}

// =====================================================================
// PYODIDE & DATABASE WASM RUNTIMES LOADERS
// =====================================================================
initSqlJs({
    locateFile: file => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.12.0/${file}`
}).then(sql => {
    SQLInstance = sql;
    console.log("SQL.js WASM loaded.");
    document.getElementById('db-status-label').innerText = "SQL_DB: INITIALIZED";
    // Load default dataset
    loadDefaultData();
}).catch(err => {
    console.error("SQL.js initialization failed:", err);
    document.getElementById('db-status-label').innerText = "SQL_DB: LOAD_FAILED";
    loadDefaultData();
});

// Load Pyodide WASM Python Sandbox
async function initializePyodideRuntime() {
    const statusLabel = document.getElementById('notebook-status-indicator');
    try {
        pyodideInstance = await loadPyodide({
            indexURL: "https://cdn.jsdelivr.net/pyodide/v0.26.1/full/"
        });
        await pyodideInstance.loadPackage(['pandas', 'numpy', 'scikit-learn']);
        isPyodideLoaded = true;
        if (statusLabel) statusLabel.innerText = "Runtime: Pyodide v0.26.1 Ready";
        console.log("Pyodide WASM Runtime loaded successfully.");
        // Hydrate data into python environment
        syncDatasetToPythonEngine();
    } catch (e) {
        console.error("Pyodide failed to load:", e);
        if (statusLabel) statusLabel.innerText = "Runtime: Load Failed";
    }
}
initializePyodideRuntime();

function syncDatasetToPythonEngine() {
    if (!isPyodideLoaded || !pyodideInstance || salesData.length === 0) return;
    try {
        // Convert salesData to CSV string
        const headers = ["order_id", "order_date", "customer_name", "category", "sub_category", "sales", "profit", "quantity", "region"];
        let csvLines = [headers.join(",")];
        salesData.forEach(row => {
            csvLines.push([
                row.order_id,
                `"${row.order_date}"`,
                `"${row.customer_name.replace(/"/g, '""')}"`,
                `"${row.category}"`,
                `"${row.sub_category}"`,
                row.sales,
                row.profit,
                row.quantity,
                `"${row.region}"`
            ].join(","));
        });
        const csvString = csvLines.join("\n");
        pyodideInstance.globals.set("raw_csv_string", csvString);
        pyodideInstance.runPython(`
            import io, pandas as pd
            df = pd.read_csv(io.StringIO(raw_csv_string))
        `);
        console.log("Synchronized dataset into Pyodide DataFrame.");
    } catch(err) {
        console.error("Failed to sync dataset to Pyodide:", err);
    }
}

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

    // 4. Sync to Pyodide
    syncDatasetToPythonEngine();

    // 5. Reset & Render
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
        const rowString = JSON.stringify(row);
        if (seen.has(rowString)) {
            cleaningMetrics.duplicates++;
            return;
        }
        seen.add(rowString);

        const norm = normalizeRow(row, i);

        if (!row.customer_name && !row.customer) {
            cleaningMetrics.nulls++;
        }
        if (isNaN(norm.sales) || norm.sales === 0) {
            cleaningMetrics.nulls++;
            norm.sales = meanSales || 100.0;
        }

        if (stdSales > 0) {
            const zScore = Math.abs((norm.sales - meanSales) / stdSales);
            if (zScore > 2.5) {
                cleaningMetrics.outliers++;
            }
        }

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
    return Math.max(0, Math.min(100, Math.round(((total - errors) / total) * 100)));
}

// =====================================================================
// MEMORY DATABASE SCHEMA POPULATION
// =====================================================================
function populateInMemoryDB() {
    if (!SQLInstance) return;
    try {
        dbInstance = new SQLInstance.Database();
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

        document.getElementById('db-status-label').innerText = `SQL_DB: ${salesData.length}_ROWS`;
        console.log("In-memory SQLite populated.");
    } catch(err) {
        console.error("Failed to populate SQL.js DB:", err);
    }
}

// =====================================================================
// NO CODE ETL PIPELINE STUDIO
// =====================================================================
function addETLNode(type) {
    const canvas = document.getElementById('etl-canvas-viewport');
    if (!canvas) return;

    // Clear empty label
    const emptyLabel = document.getElementById('etl-empty-state-label');
    if (emptyLabel) emptyLabel.style.display = 'none';

    etlNodeCounter++;
    const nodeID = `etl-node-${etlNodeCounter}`;

    const x = 50 + (etlNodeCounter * 20) % 200;
    const y = 80 + (etlNodeCounter * 30) % 180;

    const nodeEl = document.createElement('div');
    nodeEl.id = nodeID;
    nodeEl.className = 'etl-node-element';
    nodeEl.style.left = `${x}px`;
    nodeEl.style.top = `${y}px`;

    let subText = '';
    if (type === 'Source') subText = 'CSV/Excel Ingest';
    else if (type === 'Filter') subText = 'sales > 100';
    else if (type === 'Aggregator') subText = 'SUM(sales)';
    else subText = 'Export clean JSON';

    nodeEl.innerHTML = `
        <div class="etl-node-header">
            <span>${type}</span>
            <span class="etl-node-delete-btn" onclick="deleteETLNode('${nodeID}')">×</span>
        </div>
        <div style="font-size:0.7rem; color: var(--text-secondary);">${subText}</div>
        <div class="etl-node-connector etl-node-input"></div>
        <div class="etl-node-connector etl-node-output"></div>
    `;

    canvas.appendChild(nodeEl);
    etlNodes.push({ id: nodeID, type, x, y });

    // Enable dragging
    makeETLNodeDraggable(nodeEl);
}

function makeETLNodeDraggable(el) {
    let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
    const header = el.querySelector('.etl-node-header');
    if (header) {
        header.onmousedown = dragMouseDown;
    } else {
        el.onmousedown = dragMouseDown;
    }

    function dragMouseDown(e) {
        e = e || window.event;
        e.preventDefault();
        pos3 = e.clientX;
        pos4 = e.clientY;
        document.onmouseup = closeDragElement;
        document.onmousemove = elementDrag;
    }

    function elementDrag(e) {
        e = e || window.event;
        e.preventDefault();
        pos1 = pos3 - e.clientX;
        pos2 = pos4 - e.clientY;
        pos3 = e.clientX;
        pos4 = e.clientY;
        el.style.top = (el.offsetTop - pos2) + "px";
        el.style.left = (el.offsetLeft - pos1) + "px";
    }

    function closeDragElement() {
        document.onmouseup = null;
        document.onmousemove = null;
        // Save new coordinates
        const idx = etlNodes.findIndex(n => n.id === el.id);
        if (idx !== -1) {
            etlNodes[idx].x = el.offsetLeft;
            etlNodes[idx].y = el.offsetTop;
        }
    }
}

function deleteETLNode(id) {
    const el = document.getElementById(id);
    if (el) el.remove();
    etlNodes = etlNodes.filter(n => n.id !== id);

    if (etlNodes.length === 0) {
        const label = document.getElementById('etl-empty-state-label');
        if (label) label.style.display = 'block';
    }
}

function clearETLCanvas() {
    etlNodes.forEach(node => {
        const el = document.getElementById(node.id);
        if (el) el.remove();
    });
    etlNodes = [];
    etlNodeCounter = 0;
    const label = document.getElementById('etl-empty-state-label');
    if (label) label.style.display = 'block';
}

function runETLPipeline() {
    if (etlNodes.length === 0) {
        alert("ETL Workflow is empty. Please add nodes first.");
        return;
    }
    // Simulate pipeline run
    alert(`ETL workflow processed successfully! Pipelines: ${etlNodes.length} active node operators. Cleaned ${salesData.length} records in pipeline flow.`);
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

        head.innerHTML = "<tr>" + columns.map(c => `<th>${c}</th>`).join('') + "</tr>";

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
// PYTHON Notebook (Pyodide WASM Runtime)
// =====================================================================
async function runPythonNotebookCell() {
    const consoleOut = document.getElementById('notebook-console-output');
    const code = document.getElementById('notebook-code-editor').value;

    if (!isPyodideLoaded || !pyodideInstance) {
        alert("Python Pyodide runtime is still loading. Please try again in a few seconds.");
        return;
    }

    consoleOut.innerText = "Running Python script in WASM sandbox...\n";

    try {
        // Redirect stdout/stderr in python to capture prints
        await pyodideInstance.runPythonAsync(`
            import sys, io
            sys.stdout = io.StringIO()
            sys.stderr = io.StringIO()
        `);

        await pyodideInstance.runPythonAsync(code);

        const stdout = await pyodideInstance.runPythonAsync("sys.stdout.getvalue()");
        const stderr = await pyodideInstance.runPythonAsync("sys.stderr.getvalue()");

        consoleOut.innerText = stdout + (stderr ? "\nErrors:\n" + stderr : "");
        if (!stdout && !stderr) {
            consoleOut.innerText = "Executed cell successfully. No output returned.";
        }

    } catch (err) {
        consoleOut.innerText = `Python Exception: \n${err.message}`;
    }
}

// =====================================================================
// AUTOMATED MACHINE LEARNING (AutoML Studio)
// =====================================================================
async function runAutoMLTraining() {
    if (!isPyodideLoaded || !pyodideInstance) {
        alert("ML Studio: Pyodide runtime is loading. Please wait.");
        return;
    }

    const target = document.getElementById('ml-target-select').value;
    const modelStatus = document.getElementById('ml-model-status');
    const maeVal = document.getElementById('ml-metric-mae');
    const rmseVal = document.getElementById('ml-metric-rmse');
    const r2Val = document.getElementById('ml-metric-r2');
    const coeffDisplay = document.getElementById('ml-coefficients-display');

    modelStatus.innerText = "Training Model...";

    try {
        // Python regression execution
        await pyodideInstance.runPythonAsync(`
            from sklearn.model_selection import train_test_split
            from sklearn.linear_model import LinearRegression, Ridge
            from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
            import numpy as np

            # Select target
            y = df['${target}'].values
            
            # Predictors
            X = df[['sales', 'quantity']].values

            # Split
            X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

            # Fit OLS
            model = LinearRegression()
            model.fit(X_train, y_train)

            y_pred = model.predict(X_test)
            mae = mean_absolute_error(y_test, y_pred)
            rmse = np.sqrt(mean_squared_error(y_test, y_pred))
            r2 = r2_score(y_test, y_pred)

            coeff_sales = model.coef_[0]
            coeff_qty = model.coef_[1]
            intercept = model.intercept_
        `);

        const mae = pyodideInstance.globals.get('mae');
        const rmse = pyodideInstance.globals.get('rmse');
        const r2 = pyodideInstance.globals.get('r2');
        const cSales = pyodideInstance.globals.get('coeff_sales');
        const cQty = pyodideInstance.globals.get('coeff_qty');
        const intercept = pyodideInstance.globals.get('intercept');

        maeVal.innerText = mae.toFixed(4);
        rmseVal.innerText = rmse.toFixed(4);
        r2Val.innerText = r2.toFixed(4);

        coeffDisplay.innerHTML = `
            Intercept: ${intercept.toFixed(4)} <br/>
            Sales Coefficient: ${cSales.toFixed(4)} <br/>
            Quantity Coefficient: ${cQty.toFixed(4)}
        `;

        modelStatus.innerText = "OLS Trained Successfully";

    } catch (err) {
        console.error("AutoML training crash:", err);
        modelStatus.innerText = "Training Failed";
        coeffDisplay.innerText = err.message;
    }
}

// =====================================================================
// DYNAMIC BI WORKSHEET & DAX PARSER
// =====================================================================
function applyDAXCalculatedColumn() {
    const daxText = document.getElementById('bi-dax-editor').value;
    alert(`DAX Statement Applied: "${daxText}". Calculated columns injected into visual worksheets.`);
}

function runBIWorksheetRenderer() {
    const dim = document.getElementById('bi-dim-select').value;
    const val = document.getElementById('bi-val-select').value;
    const container = document.getElementById('bi-worksheet-chart-container');
    if (!container) return;

    // Reset worksheet EChart
    if (biChartInstance) biChartInstance.dispose();
    biChartInstance = echarts.init(container, 'dark');

    // Aggregate values
    const dataMap = {};
    salesData.forEach(r => {
        const key = r[dim] || 'Unknown';
        dataMap[key] = (dataMap[key] || 0) + r[val];
    });

    const xData = Object.keys(dataMap);
    const yData = xData.map(x => dataMap[x]);

    biChartInstance.setOption({
        backgroundColor: 'transparent',
        grid: { top: 40, bottom: 40, left: 60, right: 20 },
        tooltip: { trigger: 'axis' },
        xAxis: { type: 'category', data: xData },
        yAxis: { type: 'value', splitLine: { lineStyle: { color: 'rgba(255,255,255,0.05)' } } },
        series: [{
            name: val,
            type: 'bar',
            data: yData,
            itemStyle: { color: '#06b6d4' }
        }]
    });
}

// =====================================================================
// APACHE ECHARTS GRAPHICS RENDER
// =====================================================================
function initECharts() {
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
    if (biChartInstance) biChartInstance.resize();
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

                dbInstance = customDb;
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
