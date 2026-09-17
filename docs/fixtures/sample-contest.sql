INSERT INTO sequences (section, next_id) VALUES ('contests', 1)
ON CONFLICT(section) DO UPDATE SET next_id = MAX(next_id, 1);

INSERT INTO documents (section, id, created_at, kind, payload)
VALUES (
  'contests',
  1,
  1758135900000,
  'card_hunt_results',
  '{"kind":"card_hunt_results","contestName":"card_hunt","eventCounter":7,"prompt":"A gold-framed knight in rain, looking toward a distant lantern.","judgingFinishedAt":1758135900000,"buyInPrice":1000,"currency":"gold","prizePool":8000,"submissionCount":4,"reference":{"cardId":"reference","code":"AAAAA","edition":"2","number":"11","characterKey":"","seriesKey":"","submitter":"","submittedAt":0,"score":980,"imageUrl":"https://placehold.co/520x720/173e2b/a8f0c5?text=REF","sourceUrl":null},"winners":[{"place":1,"userId":"111","score":1240,"reward":4000},{"place":2,"userId":"222","score":1100,"reward":2400},{"place":3,"userId":"333","score":980,"reward":1600}],"entries":[{"cardId":"c1","code":"BBBBB","edition":"4","number":"18","characterKey":"","seriesKey":"","submitter":"111","submittedAt":1,"score":1240,"imageUrl":"https://placehold.co/520x720/222837/e8c27a?text=1","sourceUrl":null},{"cardId":"c2","code":"CCCCC","edition":"1","number":"3","characterKey":"","seriesKey":"","submitter":"222","submittedAt":2,"score":1100,"imageUrl":"https://placehold.co/520x720/222837/e8c27a?text=2","sourceUrl":null},{"cardId":"c3","code":"DDDDD","edition":"8","number":"44","characterKey":"","seriesKey":"","submitter":"333","submittedAt":3,"score":980,"imageUrl":"https://placehold.co/520x720/222837/e8c27a?text=3","sourceUrl":null},{"cardId":"c4","code":"EEEEE","edition":"3","number":"9","characterKey":"","seriesKey":"","submitter":"444","submittedAt":4,"score":1,"imageUrl":"https://placehold.co/520x720/2a1f1f/d7a3a3?text=X","sourceUrl":null}]}'
);

INSERT INTO slugs (slug, section, id) VALUES ('a1b2c3', 'contests', 1);

INSERT INTO contest_dumps (contest_name, event_counter, document_id)
VALUES ('card_hunt', 7, 1);
