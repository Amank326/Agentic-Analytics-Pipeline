@echo off
echo ===================================================
echo   AGENTIC DATA ANALYTICS PIPELINE - EXECUTION
echo ===================================================
echo.
echo Step 1: Checking Python dependencies...
python -c "import pandas, numpy, seaborn, matplotlib, sqlite3, openpyxl" >nul 2>&1
if %errorlevel% neq 0 (
    echo Python dependencies not met. Installing pandas, numpy, seaborn, matplotlib, openpyxl...
    pip install pandas numpy seaborn matplotlib openpyxl
) else (
    echo Dependencies are already installed.
)
echo.
echo Step 2: Running pipeline script...
python sales_agent_pipeline.py
echo.
echo Step 3: Verifying output files...
if exist SalesDB.db (echo  [SUCCESS] SQLite Database 'SalesDB.db' created.) else (echo  [FAILED] SQLite Database not found.)
if exist cleaned_store_sales.csv (echo  [SUCCESS] CSV Export 'cleaned_store_sales.csv' created.) else (echo  [FAILED] CSV Export not found.)
if exist sales_vs_profit_outliers.png (echo  [SUCCESS] Outlier Scatter Plot 'sales_vs_profit_outliers.png' created.) else (echo  [FAILED] Outlier Scatter Plot not found.)
if exist query_results.txt (echo  [SUCCESS] SQL Query Results 'query_results.txt' created.) else (echo  [FAILED] Query Results not found.)
echo.
echo ===================================================
echo   EXECUTION COMPLETE. PRESS ANY KEY TO EXIT.
echo ===================================================
pause >nul
