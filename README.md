# Agentic Data Analytics Pipeline

An end-to-end data analytics and business intelligence pipeline that generates synthetic sales data, cleans and processes it, stores it in an SQLite database, runs complex analytical queries, and generates financial visualizations.

---

## 🚀 Project Overview

This repository contains all the assets required for a complete sales performance analysis. It showcases:
1. **Data Ingestion & Cleaning**: Python script utilizing `pandas` and `numpy` to generate synthetic data, drop duplicate records, clean currency symbols, and enforce correct datatypes.
2. **Database Management**: Creation of a structured schema and loading the cleaned records into a relational database.
3. **Business Intelligence (SQL)**: Querying the database to extract insights on category margins, monthly sales trends, and high-value customers.
4. **Data Visualization**: A visual scatter plot identifying financial outliers and sales vs. profit correlations.
5. **Power BI Blueprint**: Visual specifications and dashboard designs to consume this pipeline's output.

---

## 📁 Repository Structure

```text
├── SalesDB.db                   # Auto-generated SQLite Database containing store_sales
├── cleaned_store_sales.csv      # Cleaned and processed dataset (CSV)
├── database_schema.sql          # MySQL DDL & queries for enterprise deployment
├── project_report.md            # Detailed analytics specifications & Power BI blueprint
├── query_results.txt            # Outputs from the SQL analytical queries
├── run_pipeline.bat             # One-click execution batch script (Windows)
├── sales_agent_pipeline.py      # Core Python data generation, cleaning & query script
└── sales_vs_profit_outliers.png # Scatter plot analyzing sales, profit, and outliers
```

---

## ⚙️ How to Run the Pipeline

### Option 1: One-Click Execution (Windows)
Double-click `run_pipeline.bat`. This script will:
1. Automatically verify and install missing Python packages (`pandas`, `numpy`, `seaborn`, `matplotlib`).
2. Run `sales_agent_pipeline.py`.
3. Generate the SQLite database, CSV file, query results, and the visualization plot.

### Option 2: Command Line
Ensure you have the required packages installed:
```bash
pip install pandas numpy seaborn matplotlib
```
Then, execute the main script:
```bash
python sales_agent_pipeline.py
```

---

## 📊 Analytical Insights (SQL Query Results Summary)

The following three queries are executed automatically on database creation:

### 1. Product Segment Analysis
Categorizes and lists sales and profit metrics to identify the most profitable product sub-categories (e.g., Paper and Accessories demonstrate the highest profit margins, while Binders and Phones show margins below breakeven).

### 2. Temporal Sales Performance Trend
Groups sales figures and total order counts by Year-Month to evaluate monthly sales growth trends.

### 3. Top Customer Segment
Ranks the top 5 customers by net profit contributions, aiding target-marketing campaigns.

---

## 🎨 Visualization Chart
The scatter plot `sales_vs_profit_outliers.png` groups products by category, correlates order quantities, and outlines outliers with reference lines for high sales volume and net-loss margins.
