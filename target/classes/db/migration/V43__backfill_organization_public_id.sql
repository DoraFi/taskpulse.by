-- Ensure every organization has a public_id for contextual URLs (/o/{org}/t/{team}/...).
update organization
set public_id = gen_random_uuid()::text
where public_id is null
   or trim(public_id) = '';
