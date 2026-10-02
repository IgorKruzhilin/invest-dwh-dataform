# invest-dwh-dataform

The same warehouse built twice. The main repository,
[invest-dwh](https://github.com/IgorKruzhilin/invest-dwh), builds the
layers with dbt and runs them from Airflow. This repository builds the
same layers from the same raw data with Dataform, the BigQuery native
tool, so the two can be compared on real numbers instead of on opinions.

Nothing here touches the datasets of the other repository. dbt owns `stg`
and `dm`; Dataform writes only into `df_stg`, `df_dm` and
`df_assertions`. Both read the same external tables in `raw`, which stay
the property of the main repository together with the extract scripts
that fill them.

## The layout

| Path | What it is |
|---|---|
| `workflow_settings.yaml` | project settings: BigQuery project, location, default dataset, compilation variables |
| `definitions/sources/` | declarations: the external tables of the raw layer, the equivalent of dbt sources |
| `definitions/staging/` | one view per source, names and types only |
| `definitions/marts/` | the star: the fact and its dimension |
| `includes/` | JavaScript functions, the equivalent of dbt macros |

A Dataform project must sit in the root of its repository: there is no
setting that points the service at a subdirectory. That is why this is a
separate repository and not a folder in the main one. The token that
Dataform uses to read this repository can then write only here, and not
into the repository that holds the CI with access to Google Cloud.

## How it maps to dbt

| dbt | Dataform |
|---|---|
| model `.sql` plus an entry in `_models.yml` | one `.sqlx` file: SQL and a `config` block together |
| Jinja and macros | JavaScript and functions in `includes/` |
| `{{ ref('x') }}`, `{{ source(...) }}` | `${ref("x")}`, a declaration instead of a source |
| `dbt_project.yml` | `workflow_settings.yaml` |
| targets in `profiles.yml` | release configurations in the service |
| generic tests | `assertions` in the config block |
| singular test | an assertion file, the same idea |
| `--vars` | `vars` in the settings, overridden per release |
| `materialized='incremental'` | `type: "incremental"` |

## Status

Step 1: the project settings, the three declarations and the first
staging view. The rest of the port follows: the other two views, the
incremental fact, the JavaScript functions, and the assertions that
replace the singular tests of the dbt project.

## Setup, once per project

The commands run on a machine with `gcloud` logged in as the project
owner. `REPO_URL` is the HTTPS address of this repository and ends with
`.git`.

```
PROJECT=project-6feb8749-c55b-4db3-af0
REGION=us-central1
NUMBER=$(gcloud projects describe $PROJECT --format 'value(projectNumber)')
AGENT=service-$NUMBER@gcp-sa-dataform.iam.gserviceaccount.com

# 1. The APIs of Dataform and of Secret Manager.
gcloud services enable dataform.googleapis.com secretmanager.googleapis.com \
  --project $PROJECT

# 2. The service agent of Dataform, the account that runs every query of
#    this repository. Enabling the API is not enough: the account is made
#    on the first request for it, and a grant before that fails with
#    "service account does not exist". This command makes it.
gcloud beta services identity create --service dataform.googleapis.com   --project $PROJECT

# 3. Its rights: run jobs, write its own datasets, and read the raw
#    layer, which is external tables over a bucket.
gcloud projects add-iam-policy-binding $PROJECT \
  --member serviceAccount:$AGENT --role roles/bigquery.jobUser
gcloud projects add-iam-policy-binding $PROJECT \
  --member serviceAccount:$AGENT --role roles/bigquery.dataEditor
gcloud storage buckets add-iam-policy-binding gs://invest-dwh-raw \
  --member serviceAccount:$AGENT --role roles/storage.objectViewer

# 4. The token that Dataform uses to read this repository. Make a
#    fine-grained personal access token on GitHub for THIS repository
#    only, with Contents read and write, and paste it into the command
#    below. It is the only secret of the project, see the note at the end.
printf '%s' 'PASTE_THE_TOKEN_HERE' | gcloud secrets create dataform-github-token \
  --project $PROJECT --replication-policy automatic --data-file=-
gcloud secrets add-iam-policy-binding dataform-github-token \
  --project $PROJECT --member serviceAccount:$AGENT \
  --role roles/secretmanager.secretAccessor

# 5. The Dataform repository, linked to this one on GitHub.
gcloud dataform repositories create invest-dwh \
  --project $PROJECT --region $REGION \
  --remote-url REPO_URL \
  --default-branch main \
  --secret-version projects/$PROJECT/secrets/dataform-github-token/versions/1
```

Then open Dataform in the Google Cloud console, create a development
workspace in the repository `invest-dwh`, and pull from the remote
branch. The workspace is the web editor; a commit and a push from it go
straight to this repository on GitHub.

## Check

In the workspace, run the first staging view and its assertions. The
view must hold exactly what the dbt view holds, and this query must
return no rows in either direction:

```sql
select * from `df_stg.stg_moex_history`
except distinct
select * from `stg.stg_moex_history`
```

## The one secret of the project

The main repository keeps no secrets at all: continuous integration logs
in to Google Cloud with Workload Identity Federation, and the export to
the site logs in to the database with IAM. Dataform cannot read a
third-party Git provider without a token, so this project has exactly one
secret, in Secret Manager, readable only by the Dataform service agent.
The token is fine-grained and scoped to this repository, which holds no
pipeline with access to Google Cloud.
