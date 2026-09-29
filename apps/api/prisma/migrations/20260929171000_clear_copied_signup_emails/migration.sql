-- Business sign-up used to copy the owner's sign-in email into the business email, which the new
-- public business page shows. Nobody chose to publish it, so clear exactly those copies; owners
-- can add a public contact email from their profile. Emails an owner entered themselves (anything
-- other than their sign-in address) are kept.
UPDATE `business_profiles` b
  JOIN `users` u ON u.`id` = b.`ownerId`
  SET b.`email` = NULL
  WHERE b.`email` = u.`email`;
