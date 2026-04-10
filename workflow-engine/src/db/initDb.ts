import db from './database.js';

export function initDb(): void {
  const alreadyInit = db.prepare(
    `SELECT name FROM sqlite_master WHERE type='table' AND name='workflow_version'`
  ).get();

  if (alreadyInit) return;

  db.exec(`
    CREATE TABLE workflow_version (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT    NOT NULL UNIQUE,
      description TEXT,
      isActive    INTEGER NOT NULL DEFAULT 0 CHECK (isActive IN (0, 1)),
      createdAt   TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE team (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT    NOT NULL UNIQUE,
      description TEXT,
      createdAt   TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE user (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      name      TEXT    NOT NULL,
      email     TEXT    NOT NULL UNIQUE,
      teamId    INTEGER NOT NULL REFERENCES team(id),
      createdAt TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE activity_definition (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      activityKey  TEXT    NOT NULL,
      versionId    INTEGER NOT NULL REFERENCES workflow_version(id),
      label        TEXT    NOT NULL,
      nodeType     TEXT    NOT NULL CHECK (nodeType IN ('start','end','task','decision','loop','parallel')),
      col          INTEGER NOT NULL,
      row          INTEGER NOT NULL,
      teamId       INTEGER REFERENCES team(id),
      actionType   TEXT    NOT NULL DEFAULT 'manual'
                   CHECK (actionType IN ('manual','approval','gate','automated')),
      slaHours     INTEGER,
      handler      TEXT,
      inputSchema  TEXT,
      UNIQUE (activityKey, versionId)
    );

    CREATE TABLE activity_transition (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      fromActivityId INTEGER NOT NULL REFERENCES activity_definition(id),
      toActivityId   INTEGER NOT NULL REFERENCES activity_definition(id),
      condition      TEXT,
      edgeType       TEXT    NOT NULL DEFAULT 'normal' CHECK (edgeType IN ('normal','loop'))
    );

    CREATE TABLE activity_task (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      activityDefId INTEGER NOT NULL REFERENCES activity_definition(id),
      title         TEXT    NOT NULL,
      description   TEXT,
      orderIndex    INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE project (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      accountNumber     TEXT    NOT NULL UNIQUE,
      accountName       TEXT    NOT NULL,
      activity          TEXT    NOT NULL,
      workflowVersionId INTEGER NOT NULL DEFAULT 1 REFERENCES workflow_version(id),
      createdAt         TEXT    NOT NULL DEFAULT (datetime('now')),
      updatedAt         TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE project_activity (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      projectId       INTEGER NOT NULL REFERENCES project(id),
      activityId      TEXT    NOT NULL,
      status          TEXT    NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending','active','completed','skipped')),
      decisionOutcome TEXT,
      iterationCount  INTEGER NOT NULL DEFAULT 0,
      startedAt       TEXT,
      completedAt     TEXT,
      input           TEXT,
      output          TEXT,
      createdAt       TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE project_activity_task (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      projectActivityId INTEGER NOT NULL REFERENCES project_activity(id),
      activityTaskId    INTEGER NOT NULL REFERENCES activity_task(id),
      completed     INTEGER NOT NULL DEFAULT 0,
      completedAt   TEXT,
      status        TEXT    NOT NULL DEFAULT 'new' CHECK (status IN ('new','in_progress','done')),
      createdAt     TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE assignment (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      projectActivityId INTEGER NOT NULL REFERENCES project_activity(id),
      userId        INTEGER NOT NULL REFERENCES user(id),
      assignedAt    TEXT    NOT NULL DEFAULT (datetime('now')),
      completedAt   TEXT,
      notes         TEXT
    );

    CREATE TABLE artifact (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      projectId INTEGER NOT NULL REFERENCES project(id) ON DELETE CASCADE,
      type      TEXT    NOT NULL CHECK (type IN ('document','email','message','communication')),
      title     TEXT    NOT NULL,
      content   TEXT,
      fileName  TEXT,
      filePath  TEXT,
      mimeType  TEXT,
      fileSize  INTEGER,
      createdAt TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE activity_event (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      projectId     INTEGER NOT NULL REFERENCES project(id) ON DELETE CASCADE,
      projectActivityId INTEGER REFERENCES project_activity(id),
      eventType     TEXT    NOT NULL CHECK (eventType IN (
                      'activity.activated', 'activity.completed',
                      'task.started',   'task.completed',
                      'user.assigned'
                    )),
      activityId    TEXT    NOT NULL,
      userId        INTEGER REFERENCES user(id),
      payload       TEXT,
      occurredAt    TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS docusign_envelope (
      envelopeId TEXT    PRIMARY KEY,
      projectId  INTEGER NOT NULL REFERENCES project(id) ON DELETE CASCADE,
      createdAt  TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX idx_activity_event_project ON activity_event(projectId, occurredAt);
  `);

  db.transaction(() => {
    db.exec(`
      INSERT INTO workflow_version (name, description, isActive)
        VALUES ('1.0', 'Initial workflow', 0);
    `);

    db.exec(`
      INSERT INTO team (name, description) VALUES
        ('Sales_User', 'Sales User'),
        ('Account_Manager', 'Account Manager'),
        ('Pricing_Analyst', 'Pricing Analyst'),
        ('Pricing_Support', 'Pricing Support'),
        ('Administrator', 'Administrator');
    `);

    db.exec(`
      INSERT INTO user (name, email, teamId) VALUES
        ('Alice Chen',     'alice.chen@example.com',     1),
        ('Bob Martinez',   'bob.martinez@example.com',   1),
        ('Carol Lee',      'carol.lee@example.com',      2),
        ('David Kim',      'david.kim@example.com',      2),
        ('Eve Johnson',    'eve.johnson@example.com',    3),
        ('Henry Brown',    'henry.brown@example.com',    4),
        ('Isabella Davis', 'isabella.davis@example.com', 4),
        ('Jack Wilson',    'jack.wilson@example.com',    5);
    `);

    db.exec(`
      INSERT INTO activity_definition (activityKey, versionId, label, nodeType, col, row, teamId, actionType, handler, inputSchema) VALUES
        ('start',          1, 'Start',                 'start',    0,  2, NULL, 'gate',      NULL, NULL),
        ('requirements',   1, 'Gather\nRequirements',  'task',     1,  2, 1,    'manual',    NULL, NULL),
        ('design',         1, 'Design',                'task',     2,  2, 2,    'manual',    NULL, NULL),
        ('review_design',  1, 'Design\nApproved?',     'decision', 3,  2, 2,    'approval',  NULL, NULL),
        ('parallel_split', 1, 'Parallel\nWork',        'parallel', 4,  2, NULL, 'gate',      NULL, NULL),
        ('frontend',       1, 'Frontend\nDev',         'task',     5,  1, 3,    'manual',    NULL, NULL),
        ('backend',        1, 'Backend\nDev',          'task',     5,  3, 3,    'manual',    NULL, NULL),
        ('parallel_join',  1, 'Sync',                  'parallel', 6,  2, NULL, 'gate',      NULL, NULL),
        ('testing',        1, 'Testing &\nQA',         'task',     7,  2, 4,    'manual',    NULL, NULL),
        ('bugs_found',     1, 'Bugs\nFound?',          'decision', 8,  2, 4,    'approval',  NULL, NULL),
        ('fix_bugs',       1, 'Fix Bugs',              'loop',     8,  0, 3,    'manual',    NULL, NULL),
        ('staging',        1, 'Deploy to\nStaging',    'task',     9,  2, 5,    'manual',    NULL, NULL),
        ('uat',            1, 'UAT\nPassed?',          'decision', 10, 2, 4,    'approval',  NULL, NULL),
        ('deploy',         1, 'Deploy to\nProduction', 'task',     11, 2, 5,    'manual',    NULL, NULL),
        ('end',            1, 'Done',                  'end',      12, 2, NULL, 'gate',      NULL, NULL);
    `);

    db.exec(`
      INSERT INTO activity_transition (fromActivityId, toActivityId, condition, edgeType)
      SELECT (SELECT id FROM activity_definition WHERE activityKey='start'          AND versionId=1),
             (SELECT id FROM activity_definition WHERE activityKey='requirements'   AND versionId=1), NULL,   'normal' UNION ALL
      SELECT (SELECT id FROM activity_definition WHERE activityKey='requirements'   AND versionId=1),
             (SELECT id FROM activity_definition WHERE activityKey='design'         AND versionId=1), NULL,   'normal' UNION ALL
      SELECT (SELECT id FROM activity_definition WHERE activityKey='design'         AND versionId=1),
             (SELECT id FROM activity_definition WHERE activityKey='review_design'  AND versionId=1), NULL,   'normal' UNION ALL
      SELECT (SELECT id FROM activity_definition WHERE activityKey='review_design'  AND versionId=1),
             (SELECT id FROM activity_definition WHERE activityKey='parallel_split' AND versionId=1), 'yes',  'normal' UNION ALL
      SELECT (SELECT id FROM activity_definition WHERE activityKey='review_design'  AND versionId=1),
             (SELECT id FROM activity_definition WHERE activityKey='design'         AND versionId=1), 'no',   'loop'   UNION ALL
      SELECT (SELECT id FROM activity_definition WHERE activityKey='parallel_split' AND versionId=1),
             (SELECT id FROM activity_definition WHERE activityKey='frontend'       AND versionId=1), NULL,   'normal' UNION ALL
      SELECT (SELECT id FROM activity_definition WHERE activityKey='parallel_split' AND versionId=1),
             (SELECT id FROM activity_definition WHERE activityKey='backend'        AND versionId=1), NULL,   'normal' UNION ALL
      SELECT (SELECT id FROM activity_definition WHERE activityKey='frontend'       AND versionId=1),
             (SELECT id FROM activity_definition WHERE activityKey='parallel_join'  AND versionId=1), NULL,   'normal' UNION ALL
      SELECT (SELECT id FROM activity_definition WHERE activityKey='backend'        AND versionId=1),
             (SELECT id FROM activity_definition WHERE activityKey='parallel_join'  AND versionId=1), NULL,   'normal' UNION ALL
      SELECT (SELECT id FROM activity_definition WHERE activityKey='parallel_join'  AND versionId=1),
             (SELECT id FROM activity_definition WHERE activityKey='testing'        AND versionId=1), NULL,   'normal' UNION ALL
      SELECT (SELECT id FROM activity_definition WHERE activityKey='testing'        AND versionId=1),
             (SELECT id FROM activity_definition WHERE activityKey='bugs_found'     AND versionId=1), NULL,   'normal' UNION ALL
      SELECT (SELECT id FROM activity_definition WHERE activityKey='bugs_found'     AND versionId=1),
             (SELECT id FROM activity_definition WHERE activityKey='fix_bugs'       AND versionId=1), 'yes',  'normal' UNION ALL
      SELECT (SELECT id FROM activity_definition WHERE activityKey='fix_bugs'       AND versionId=1),
             (SELECT id FROM activity_definition WHERE activityKey='testing'        AND versionId=1), NULL,   'loop'   UNION ALL
      SELECT (SELECT id FROM activity_definition WHERE activityKey='bugs_found'     AND versionId=1),
             (SELECT id FROM activity_definition WHERE activityKey='staging'        AND versionId=1), 'no',   'normal' UNION ALL
      SELECT (SELECT id FROM activity_definition WHERE activityKey='staging'        AND versionId=1),
             (SELECT id FROM activity_definition WHERE activityKey='uat'            AND versionId=1), NULL,   'normal' UNION ALL
      SELECT (SELECT id FROM activity_definition WHERE activityKey='uat'            AND versionId=1),
             (SELECT id FROM activity_definition WHERE activityKey='deploy'         AND versionId=1), 'pass', 'normal' UNION ALL
      SELECT (SELECT id FROM activity_definition WHERE activityKey='uat'            AND versionId=1),
             (SELECT id FROM activity_definition WHERE activityKey='fix_bugs'       AND versionId=1), 'fail', 'loop'   UNION ALL
      SELECT (SELECT id FROM activity_definition WHERE activityKey='deploy'         AND versionId=1),
             (SELECT id FROM activity_definition WHERE activityKey='end'            AND versionId=1), NULL,   'normal';
    `);

    const taskRows: [string, string, string | null, number][] = [
      ['requirements', 'Conduct stakeholder interviews',       'Identify and interview key stakeholders to gather requirements', 0],
      ['requirements', 'Document functional requirements',     'Write detailed functional requirements based on stakeholder input', 1],
      ['requirements', 'Document non-functional requirements', 'Define performance, security, and reliability requirements', 2],
      ['requirements', 'Get stakeholder sign-off',             'Obtain formal approval of the requirements document', 3],
      ['design', 'Create wireframes',          'Produce low-fidelity and high-fidelity UI wireframes', 0],
      ['design', 'Define system architecture', 'Design the overall system architecture and component structure', 1],
      ['design', 'Define API contracts',       'Specify API endpoints, payloads, and error responses', 2],
      ['review_design', 'Review wireframes with stakeholders', 'Walk stakeholders through the design and gather feedback', 0],
      ['review_design', 'Verify architecture feasibility',     'Confirm technical approach is viable within constraints', 1],
      ['review_design', 'Obtain design approval',              'Get formal sign-off to proceed to development', 2],
      ['frontend', 'Implement UI components',      'Build all required UI components per the approved design', 0],
      ['frontend', 'Write unit tests',             'Cover components with unit tests targeting >80% coverage', 1],
      ['frontend', 'Conduct accessibility review', 'Ensure WCAG 2.1 AA compliance', 2],
      ['frontend', 'Code review',                  'Peer review of all frontend changes', 3],
      ['backend', 'Implement API endpoints',  'Build all API endpoints per the defined contracts', 0],
      ['backend', 'Write unit tests',         'Cover business logic with unit tests targeting >80% coverage', 1],
      ['backend', 'Apply database migrations','Run and verify all schema migrations', 2],
      ['backend', 'Code review',              'Peer review of all backend changes', 3],
      ['testing', 'Write test cases',         'Document test cases covering all acceptance criteria', 0],
      ['testing', 'Execute functional tests', 'Run all functional test cases and record results', 1],
      ['testing', 'Execute regression tests', 'Confirm no existing functionality has been broken', 2],
      ['testing', 'Performance testing',      'Validate performance under expected load', 3],
      ['testing', 'Document test results',    'Compile and share test results report', 4],
      ['bugs_found', 'Triage reported bugs',   'Classify and confirm each reported bug', 0],
      ['bugs_found', 'Document bug reports',   'Create detailed bug tickets with steps to reproduce', 1],
      ['bugs_found', 'Prioritise by severity', 'Rank bugs by impact and assign to appropriate team', 2],
      ['fix_bugs', 'Investigate root causes', 'Analyse each bug to determine the underlying cause', 0],
      ['fix_bugs', 'Apply fixes',             'Implement code fixes for all prioritised bugs', 1],
      ['fix_bugs', 'Update unit tests',       'Add or update tests to cover the fixed scenarios', 2],
      ['fix_bugs', 'Peer review fixes',       'Have fixes reviewed before merging', 3],
      ['staging', 'Deploy build to staging',   'Run deployment pipeline targeting the staging environment', 0],
      ['staging', 'Run smoke tests',           'Execute critical-path smoke tests on staging', 1],
      ['staging', 'Verify environment config', 'Confirm all environment variables and integrations are correct', 2],
      ['uat', 'Coordinate UAT sessions',         'Schedule and brief end-users for acceptance testing', 0],
      ['uat', 'Collect and document feedback',   'Record all feedback from UAT participants', 1],
      ['uat', 'Confirm acceptance criteria met', 'Verify all agreed acceptance criteria are satisfied', 2],
      ['deploy', 'Create deployment plan', 'Document rollout steps, rollback procedure, and comms plan', 0],
      ['deploy', 'Deploy to production',   'Execute the deployment to the production environment', 1],
      ['deploy', 'Monitor for errors',     'Watch error rates, latency, and logs for 30 minutes post-deploy', 2],
      ['deploy', 'Update release notes',   'Publish release notes to stakeholders', 3],
    ];
    const insertTask = db.prepare(
      `INSERT INTO activity_task (activityDefId, title, description, orderIndex)
       VALUES ((SELECT id FROM activity_definition WHERE activityKey=? AND versionId=1), ?, ?, ?)`
    );
    for (const [activityKey, title, desc, ord] of taskRows) {
      insertTask.run(activityKey, title, desc, ord);
    }

    // Workflow 2.0
    db.exec(`
      INSERT INTO workflow_version (name, description, isActive)
        VALUES ('2.0', 'Arian workflow', 0);
    `);

    db.exec(`
      INSERT INTO activity_definition (activityKey, versionId, label, nodeType, col, row, teamId, actionType, handler, inputSchema) VALUES
        ('start',           2, 'Start',               'start',    0, 0, NULL, 'gate',      NULL,           NULL),
        ('requirements',    2, 'Gather\nRequirements','task',     1, 0, 1,    'manual',    'weather',      '[{"key":"label","label":"City","type":"text","required":true,"defaultValue":""},{"key":"latitude","label":"Latitude","type":"text","required":true,"defaultValue":"51.5074"},{"key":"longitude","label":"Longitude","type":"text","required":true,"defaultValue":"-0.1278"}]'),
        ('prepare_proposal',2, 'Prepare\nProposal',   'task',     2, 0, 2,    'automated', 'weather',      '[{"key":"label","label":"City","type":"text","required":true,"defaultValue":"London"},{"key":"latitude","label":"Latitude","type":"text","required":true,"defaultValue":"51.5074"},{"key":"longitude","label":"Longitude","type":"text","required":true,"defaultValue":"-0.1278"}]'),
        ('send_proposal',   2, 'Send\nProposal',      'task',     3, 0, 2,    'manual',    'send_proposal','[{"key":"buyerEmail","label":"Buyer Email","type":"text","required":true,"defaultValue":"abajollari@gmail.com"},{"key":"buyerName","label":"Buyer Name","type":"text","required":true,"defaultValue":"ari gmail"},{"key":"sellerEmail","label":"Seller Email","type":"text","required":true,"defaultValue":"arianb1@hotmail.com"},{"key":"sellerName","label":"Seller Name","type":"text","required":true,"defaultValue":"ari hmail"},{"key":"agreementParty","label":"Agreement Party","type":"text","required":true,"defaultValue":"Acme Corp"},{"key":"jurisdiction","label":"Jurisdiction","type":"text","required":true,"defaultValue":"NJ Fort Lee"}]'),
        ('signed',          2, 'Signed',              'task',     4, 0, NULL, 'gate',      NULL,           NULL),
        ('submit',          2, 'Submit',              'task',     5, 0, 3,    'manual',    NULL,           NULL),
        ('end',             2, 'Done',                'end',      6, 0, NULL, 'gate',      NULL,           NULL);
    `);

    db.exec(`
      INSERT INTO activity_transition (fromActivityId, toActivityId, condition, edgeType)
      SELECT (SELECT id FROM activity_definition WHERE activityKey='start'           AND versionId=2),
             (SELECT id FROM activity_definition WHERE activityKey='requirements'    AND versionId=2), NULL, 'normal' UNION ALL
      SELECT (SELECT id FROM activity_definition WHERE activityKey='requirements'    AND versionId=2),
             (SELECT id FROM activity_definition WHERE activityKey='prepare_proposal'AND versionId=2), NULL, 'normal' UNION ALL
      SELECT (SELECT id FROM activity_definition WHERE activityKey='prepare_proposal'AND versionId=2),
             (SELECT id FROM activity_definition WHERE activityKey='send_proposal'   AND versionId=2), NULL, 'normal' UNION ALL
      SELECT (SELECT id FROM activity_definition WHERE activityKey='send_proposal'   AND versionId=2),
             (SELECT id FROM activity_definition WHERE activityKey='signed'          AND versionId=2), NULL, 'normal' UNION ALL
      SELECT (SELECT id FROM activity_definition WHERE activityKey='signed'          AND versionId=2),
             (SELECT id FROM activity_definition WHERE activityKey='submit'          AND versionId=2), NULL, 'normal' UNION ALL
      SELECT (SELECT id FROM activity_definition WHERE activityKey='submit'          AND versionId=2),
             (SELECT id FROM activity_definition WHERE activityKey='end'             AND versionId=2), NULL, 'normal';
    `);

    const taskRows2: [string, string, string | null, number][] = [
      ['requirements', 'Conduct stakeholder interviews',       'Identify and interview key stakeholders to gather requirements', 0],
      ['requirements', 'Document functional requirements',     'Write detailed functional requirements based on stakeholder input', 1],
      ['requirements', 'Document non-functional requirements', 'Define performance, security, and reliability requirements', 2],
      ['requirements', 'Get stakeholder sign-off',             'Obtain formal approval of the requirements document', 3],
    ];
    const insertTask2 = db.prepare(
      `INSERT INTO activity_task (activityDefId, title, description, orderIndex)
       VALUES ((SELECT id FROM activity_definition WHERE activityKey=? AND versionId=2), ?, ?, ?)`
    );
    for (const [activityKey, title, desc, ord] of taskRows2) {
      insertTask2.run(activityKey, title, desc, ord);
    }

    // Workflow 3.0
    db.exec(`
      INSERT INTO workflow_version (name, description, isActive)
        VALUES ('3.0', 'Custom Pricing', 1);
    `);

    // 'writeToExcel' handler
    db.exec(`
      INSERT INTO activity_definition (activityKey, versionId, label, nodeType, col, row, teamId, actionType, handler, inputSchema) VALUES
        ('start',3,'Start','start',0,0, 1,'gate',NULL,NULL),
        ('step1',3,'PQR Created','task',1,0, 1,'gate',NULL,NULL),
        ('step2',3,'PQR Submitted','task',2,0, 1,'gate',NULL,NULL),
        ('step3',3,'PQR Approved?','decision',3,0, 1,'approval',NULL,NULL),
        ('step4',3,'PQR Assigned','task',4,0, 1,'gate',NULL,NULL),
        ('step5',3,'Pre-Bid Created','task',4,1, 1,'gate',NULL,NULL),
        ('step6',3,'Run Analyzer','task',5,1, 1,'gate',NULL,NULL),
        ('step7',3,'PQA Created','task',6,1, 1,'gate',NULL,NULL),
        ('step8',3,'PQA Submitted','task',7,1, 1,'gate',NULL,NULL),
        ('step9',3,'PQA Received (sales)','task',7,0, 1,'gate',NULL,NULL),
        ('step10',3,'Sales/Customer Approved?','decision',8,0, 1,'approval',NULL,NULL),
        ('step11',3,'Draft Contract','task',9,0, 1,'gate',NULL,NULL),
        ('step12',3,'Legal Review?','decision',9,1, 1,'approval',NULL,NULL),
        ('step13',3,'Sales Receives Draft','task',10,1, 1,'gate',NULL,NULL),
        ('step14',3,'Sales Approves Draft?','decision',11,1, 1,'approval',NULL,NULL),
        ('step15',3,'Create Contract','task',12,1, 1,'gate',NULL,NULL),
        ('step16',3,'Submit Contract','task',12,0, 1,'gate',NULL,NULL),
        ('step17',3,'Customer Signed','task',13,0, 1,'gate',NULL,NULL),
        ('step18',3,'Sales Signed','task',14,0, 1,'gate',NULL,NULL),
        ('step19',3,'Create IAS Bid','task',15,0, 1,'gate',NULL,NULL),
        ('step20',3,'Accept Bid','task',16,0, 1,'gate',NULL,NULL),
        ('end',3,'Done','end',17,0, 1,'gate',NULL,NULL);
    `);

    db.exec(`
      INSERT INTO activity_transition (fromActivityId, toActivityId, condition, edgeType)
      SELECT (SELECT id FROM activity_definition WHERE activityKey='start' AND versionId=3),(SELECT id FROM activity_definition WHERE activityKey='step1' AND versionId=3), NULL, 'normal' UNION ALL
SELECT (SELECT id FROM activity_definition WHERE activityKey='step1' AND versionId=3),(SELECT id FROM activity_definition WHERE activityKey='step2' AND versionId=3), NULL, 'normal' UNION ALL
SELECT (SELECT id FROM activity_definition WHERE activityKey='step2' AND versionId=3),(SELECT id FROM activity_definition WHERE activityKey='step3' AND versionId=3), NULL, 'normal' UNION ALL
SELECT (SELECT id FROM activity_definition WHERE activityKey='step3' AND versionId=3),(SELECT id FROM activity_definition WHERE activityKey='step4' AND versionId=3), 'yes', 'normal' UNION ALL
SELECT (SELECT id FROM activity_definition WHERE activityKey='step3' AND versionId=3),(SELECT id FROM activity_definition WHERE activityKey='step2' AND versionId=3), 'no', 'loop' UNION ALL
SELECT (SELECT id FROM activity_definition WHERE activityKey='step4' AND versionId=3),(SELECT id FROM activity_definition WHERE activityKey='step5' AND versionId=3), NULL, 'normal' UNION ALL
SELECT (SELECT id FROM activity_definition WHERE activityKey='step5' AND versionId=3),(SELECT id FROM activity_definition WHERE activityKey='step6' AND versionId=3), NULL, 'normal' UNION ALL
SELECT (SELECT id FROM activity_definition WHERE activityKey='step6' AND versionId=3),(SELECT id FROM activity_definition WHERE activityKey='step7' AND versionId=3), NULL, 'normal' UNION ALL
SELECT (SELECT id FROM activity_definition WHERE activityKey='step7' AND versionId=3),(SELECT id FROM activity_definition WHERE activityKey='step8' AND versionId=3), NULL, 'normal' UNION ALL
SELECT (SELECT id FROM activity_definition WHERE activityKey='step8' AND versionId=3),(SELECT id FROM activity_definition WHERE activityKey='step9' AND versionId=3), NULL, 'normal' UNION ALL
SELECT (SELECT id FROM activity_definition WHERE activityKey='step9' AND versionId=3),(SELECT id FROM activity_definition WHERE activityKey='step10' AND versionId=3), NULL, 'normal' UNION ALL
SELECT (SELECT id FROM activity_definition WHERE activityKey='step10' AND versionId=3),(SELECT id FROM activity_definition WHERE activityKey='step11' AND versionId=3), 'yes', 'normal' UNION ALL
SELECT (SELECT id FROM activity_definition WHERE activityKey='step10' AND versionId=3),(SELECT id FROM activity_definition WHERE activityKey='step9' AND versionId=3), 'no', 'loop' UNION ALL
SELECT (SELECT id FROM activity_definition WHERE activityKey='step11' AND versionId=3),(SELECT id FROM activity_definition WHERE activityKey='step12' AND versionId=3), NULL, 'normal' UNION ALL
SELECT (SELECT id FROM activity_definition WHERE activityKey='step12' AND versionId=3),(SELECT id FROM activity_definition WHERE activityKey='step13' AND versionId=3), 'yes', 'normal' UNION ALL
SELECT (SELECT id FROM activity_definition WHERE activityKey='step12' AND versionId=3),(SELECT id FROM activity_definition WHERE activityKey='step11' AND versionId=3), 'no', 'loop' UNION ALL
SELECT (SELECT id FROM activity_definition WHERE activityKey='step13' AND versionId=3),(SELECT id FROM activity_definition WHERE activityKey='step14' AND versionId=3), NULL, 'normal' UNION ALL
SELECT (SELECT id FROM activity_definition WHERE activityKey='step14' AND versionId=3),(SELECT id FROM activity_definition WHERE activityKey='step15' AND versionId=3), 'yes', 'normal' UNION ALL
SELECT (SELECT id FROM activity_definition WHERE activityKey='step14' AND versionId=3),(SELECT id FROM activity_definition WHERE activityKey='step13' AND versionId=3), 'no', 'loop' UNION ALL
SELECT (SELECT id FROM activity_definition WHERE activityKey='step15' AND versionId=3),(SELECT id FROM activity_definition WHERE activityKey='step16' AND versionId=3), NULL, 'normal' UNION ALL
SELECT (SELECT id FROM activity_definition WHERE activityKey='step16' AND versionId=3),(SELECT id FROM activity_definition WHERE activityKey='step17' AND versionId=3), NULL, 'normal' UNION ALL
SELECT (SELECT id FROM activity_definition WHERE activityKey='step17' AND versionId=3),(SELECT id FROM activity_definition WHERE activityKey='step18' AND versionId=3), NULL, 'normal' UNION ALL
SELECT (SELECT id FROM activity_definition WHERE activityKey='step18' AND versionId=3),(SELECT id FROM activity_definition WHERE activityKey='step19' AND versionId=3), NULL, 'normal' UNION ALL
SELECT (SELECT id FROM activity_definition WHERE activityKey='step19' AND versionId=3),(SELECT id FROM activity_definition WHERE activityKey='step20' AND versionId=3), NULL, 'normal' UNION ALL
SELECT (SELECT id FROM activity_definition WHERE activityKey='step20' AND versionId=3),(SELECT id FROM activity_definition WHERE activityKey='end' AND versionId=3), NULL, 'normal' ;
    `);

    const taskRows3: [string, string, string | null, number][] = [
      ['step1', 'Conduct stakeholder interviews',       'Identify and interview key stakeholders to gather requirements', 0],
      ['step1', 'Document functional requirements',     'Write detailed functional requirements based on stakeholder input', 1],
      ['step1', 'Document non-functional requirements', 'Define performance, security, and reliability requirements', 2],
      ['step1', 'Get stakeholder sign-off',             'Obtain formal approval of the requirements document', 3],
    ];
    const insertTask3 = db.prepare(
      `INSERT INTO activity_task (activityDefId, title, description, orderIndex)
       VALUES ((SELECT id FROM activity_definition WHERE activityKey=? AND versionId=3), ?, ?, ?)`
    );
    for (const [activityKey, title, desc, ord] of taskRows3) {
      insertTask3.run(activityKey, title, desc, ord);
    }


    // Sample projects
    db.exec(`
      INSERT INTO project (accountNumber, accountName, activity, workflowVersionId) VALUES
        ('ACC-0001', 'Apex Dynamics',      'requirements',  1),
        ('ACC-0002', 'Blue Ridge Systems', 'review_design', 1),
        ('ACC-0003', 'Crestline Software', 'testing',       1),
        ('ACC-0004', 'Delta Technologies', 'staging',       1),
        ('ACC-0005', 'Echo Innovations',   'deploy',        1);
    `);

    db.exec(`
      INSERT INTO project_activity (projectId, activityId, status, iterationCount, startedAt)
      SELECT id, activity, 'active', 0, datetime('now')
      FROM project;
    `);

    db.exec(`
      INSERT INTO project_activity_task (projectActivityId, activityTaskId)
      SELECT ps.id, st.id
      FROM project_activity ps
      JOIN project p ON p.id = ps.projectId
      JOIN activity_definition ad ON ad.activityKey = ps.activityId AND ad.versionId = p.workflowVersionId
      JOIN activity_task st ON st.activityDefId = ad.id;
    `);
  })();

  // Migrations — run on every startup regardless of whether the DB was just created
  const hasCallbackToken = (db.prepare(
    `SELECT COUNT(*) AS count FROM pragma_table_info('project_activity') WHERE name = 'callbackToken'`
  ).get() as { count: number }).count;

  if (!hasCallbackToken) {
    db.exec(`ALTER TABLE project_activity ADD COLUMN callbackToken TEXT`);
    console.log('[db] migration: added callbackToken to project_activity');
  }

  const hasWebhookTable = db.prepare(
    `SELECT name FROM sqlite_master WHERE type='table' AND name='webhook_subscription'`
  ).get();
  if (!hasWebhookTable) {
    db.exec(`
      CREATE TABLE webhook_subscription (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        activityKey TEXT    NOT NULL,
        url         TEXT    NOT NULL,
        secret      TEXT,
        createdAt   TEXT    NOT NULL DEFAULT (datetime('now'))
      )
    `);
    console.log('[db] migration: created webhook_subscription table');
  }

  const hasEmailTable = db.prepare(
    `SELECT name FROM sqlite_master WHERE type='table' AND name='email_subscription'`
  ).get();
  if (!hasEmailTable) {
    db.exec(`
      CREATE TABLE email_subscription (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        activityKey TEXT    NOT NULL,
        email       TEXT    NOT NULL,
        name        TEXT,
        createdAt   TEXT    NOT NULL DEFAULT (datetime('now'))
      )
    `);
    console.log('[db] migration: created email_subscription table');
  }

  console.log('[db] database initialised');
}
