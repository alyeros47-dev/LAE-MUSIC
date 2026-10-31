'use strict';
// Read existing records only: complimentary tasks do not create paid usage rows.
async function studioHistory(pool,artistId){
 const exists=await pool.query("SELECT to_regclass('sonic_test_tasks') AS table_name");
 const q=await pool.query(exists.rows[0].table_name?`
  WITH entries AS (
   SELECT su.generation_reference,su.created_at,COALESCE(st.status,'reserved') AS status,
    CASE WHEN su.purchase_order_id IS NULL THEN 'included' ELSE 'purchased' END AS funding_source
   FROM artist_studio_usage su LEFT JOIN sonic_test_tasks st
    ON st.task_id=su.generation_reference AND st.creator_id=su.artist_id
   WHERE su.artist_id=$1
   UNION ALL
   SELECT st.task_id,st.created_at,st.status,'recorded' AS funding_source
   FROM sonic_test_tasks st WHERE st.creator_id=$1 AND NOT EXISTS (
    SELECT 1 FROM artist_studio_usage su WHERE su.artist_id=$1 AND su.generation_reference=st.task_id
   )
  ) SELECT * FROM entries ORDER BY created_at DESC,generation_reference DESC LIMIT 30
 `:"SELECT generation_reference,created_at,'reserved' AS status FROM artist_studio_usage WHERE artist_id=$1 ORDER BY created_at DESC LIMIT 30",[artistId]);
 return {generations:q.rows,limit:30,payments_enabled:false};
}
module.exports={studioHistory};
