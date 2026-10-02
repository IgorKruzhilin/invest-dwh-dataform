/**
 * The cumulative split factor of a security on a date.
 *
 * The dbt project keeps the same formula in a Jinja macro. BigQuery has
 * no aggregate for a product, so the product of the ratios is taken as
 * exp(sum(ln(x))). Without the rounding the result of a 1 to 10 split
 * comes out as 9.999999999999998. coalesce gives 1 to a security with no
 * split at all.
 *
 * It is one function and not a copy in two places on purpose: the model
 * and the assertion that checks it must compute the factor the same way,
 * or the assertion only proves that a copy equals a copy.
 */
function splitCumFactor(splitAfter, splitBefore) {
	return `coalesce(round(exp(sum(ln(${splitAfter} / ${splitBefore}))), 6), 1)`;
}

module.exports = { splitCumFactor };
