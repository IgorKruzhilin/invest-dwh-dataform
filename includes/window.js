/**
 * The start of the reload window of an incremental model.
 *
 * This is the one place where Dataform and dbt differ in kind, not in
 * syntax. The dbt macro asks BigQuery for max(trade_date) while it
 * compiles the model, with run_query, and pastes the answer into the SQL
 * as a literal. Dataform compiles without a connection to BigQuery: the
 * compilation is plain JavaScript and cannot run a query. So the window
 * is computed at run time instead, by the warehouse itself, and the
 * model reads it from a script variable declared before the merge.
 *
 * The result is the same window and one less moving part: the SQL does
 * not depend on what the table looked like at compile time.
 *
 * A backfill overrides the window with the compilation variable
 * windowStart, which a release configuration can set per environment.
 */
function windowStart(self, days) {
	const override = dataform.projectConfig.vars.windowStart;
	if (override) {
		return `select date '${override}'`;
	}
	// coalesce covers the first incremental run after a table was emptied:
	// max() over no rows is null, and the window must still be a date.
	return `select coalesce(date_sub(max(trade_date), interval ${days} day), date '1900-01-01') from ${self}`;
}

module.exports = { windowStart };
