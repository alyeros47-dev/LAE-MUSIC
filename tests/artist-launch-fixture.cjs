'use strict';
// Existing paid-package tests model registrations after the launch has filled.
// Fill it through the actual trigger; never fabricate an allocation counter.
async function filledPromotion(pool){
 require('./ci-database.cjs').ciDatabase();
 const left=(await pool.query('SELECT capacity-allocated AS n FROM artist_launch_campaign WHERE singleton')).rows[0].n;
 if(left)await pool.query("INSERT INTO creators(display_name,email,password_salt,password_hash) SELECT 'Promotion fixture '||n,'promotion-fixture-'||n||'@closed-launch.invalid','unused-fixture-salt','unused-fixture-hash' FROM generate_series(1,$1::integer) n",[left]);
}
module.exports={filledPromotion};
