from datetime import datetime

from airflow import DAG
from airflow.operators.bash import BashOperator
from airflow.operators.python import PythonOperator


def run_rollback_if_needed():
    # Placeholder for auto rollback policy based on model quality metrics.
    # In production this should query MLflow metrics and traffic A/B stats.
    return "no_rollback"


with DAG(
    dag_id="ai_analytics_pipeline",
    start_date=datetime(2026, 1, 1),
    schedule="0 * * * *",
    catchup=False,
    tags=["ai", "analytics", "mlops"],
) as dag:
    ingest_cdc = BashOperator(
        task_id="ingest_cdc",
        bash_command="python /opt/airflow/dags/jobs/ingest_cdc.py",
    )

    dbt_transform = BashOperator(
        task_id="dbt_transform",
        bash_command="python /opt/airflow/dags/jobs/run_dbt_transform.py",
    )

    materialize_features = BashOperator(
        task_id="materialize_features",
        bash_command="python /opt/airflow/dags/jobs/materialize_features.py",
    )

    daily_inference = BashOperator(
        task_id="daily_inference",
        bash_command="python /opt/airflow/dags/jobs/run_daily_inference.py",
    )

    weekly_retrain = BashOperator(
        task_id="weekly_retrain",
        bash_command="python /opt/airflow/dags/jobs/run_weekly_retrain.py",
    )

    model_register = BashOperator(
        task_id="model_register",
        bash_command="python /opt/airflow/dags/jobs/register_model.py",
    )

    deploy_serving = BashOperator(
        task_id="deploy_serving",
        bash_command="python /opt/airflow/dags/jobs/deploy_serving.py",
    )

    rollback_guard = PythonOperator(
        task_id="rollback_guard",
        python_callable=run_rollback_if_needed,
    )

    retention_cleanup = BashOperator(
        task_id="retention_cleanup",
        bash_command="python /opt/airflow/dags/jobs/retention_cleanup.py",
    )

    ingest_cdc >> dbt_transform >> materialize_features
    materialize_features >> daily_inference
    materialize_features >> weekly_retrain >> model_register >> deploy_serving >> rollback_guard
    daily_inference >> retention_cleanup
