'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const mysql = require('mysql2/promise');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const baseUrl = process.env.TEST_BASE_URL || 'http://127.0.0.1:3001';

async function request(method, pathname, body, expectedStatus = 200) {
  const options = { method, headers: {} };
  if (body !== undefined) {
    options.headers['content-type'] = 'application/json';
    options.body = JSON.stringify(body);
  }
  const response = await fetch(`${baseUrl}${pathname}`, options);
  const payload = await response.json();
  assert.equal(response.status, expectedStatus, `${method} ${pathname}: ${JSON.stringify(payload)}`);
  if (expectedStatus === 200) assert.equal(payload.code, 200, `${method} ${pathname}`);
  return payload;
}

async function setUserRole(userId, role) {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
  });
  await connection.execute('UPDATE users SET role = ? WHERE id = ?', [role, userId]);
  await connection.end();
}

async function main() {
  const suffix = Date.now();
  const aliceAccount = `alice${suffix}@alumni.uic.edu.cn`;
  const bobAccount = `bob${suffix}@alumni.uic.edu.cn`;

  const health = await request('GET', '/health');
  assert.equal(health.data.database, true);

  const alice = (await request('POST', '/register', { account: aliceAccount, password: 'Secret123!', nickname: 'Alice', bio: '测试用户A' })).data;
  const bob = (await request('POST', '/register', { account: bobAccount, password: 'Secret123!', nickname: 'Bob', bio: '测试用户B' })).data;
  await setUserRole(alice.user_id, 'admin');
  const login = await request('POST', '/login', { account: aliceAccount, password: 'Secret123!' });
  assert.equal(login.data.user_id, alice.user_id);
  assert.equal(login.data.isAdmin, true);

  const form = new FormData();
  form.append('file', new Blob(['fake-image-content'], { type: 'image/png' }), 'smoke.png');
  const uploadResponse = await fetch(`${baseUrl}/upload`, { method: 'POST', body: form });
  const upload = await uploadResponse.json();
  assert.equal(upload.code, 200);
  assert.ok(upload.filePath, 'legacy upload contract must expose top-level filePath');
  assert.ok(upload.imageUrl, 'avatar upload contract must expose top-level imageUrl');
  assert.ok(upload.data.filePath);

  const post = (await request('POST', '/create-post', {
    user_id: alice.user_id,
    zone_id: 2,
    title: `接口测试帖子 ${suffix}`,
    content: '用于验证完整后端接口',
    picturePaths: [`${baseUrl}/images/${upload.data.filePath}`]
  })).data;

  const posts = await request('GET', `/posts?userId=${bob.user_id}`);
  assert.ok(posts.data.some((item) => item.post_id === post.post_id));
  const detail = await request('GET', `/post/${post.post_id}?userId=${bob.user_id}`);
  assert.equal(detail.data.author_id, alice.user_id);
  await request('PUT', `/posts/${post.post_id}`, {
    userId: alice.user_id,
    zone_id: 3,
    title: `已编辑帖子 ${suffix}`,
    content: '编辑后的帖子内容',
    picturePaths: detail.data.images
  });
  const edited = await request('GET', `/post/${post.post_id}?userId=${alice.user_id}`);
  assert.equal(edited.data.title, `已编辑帖子 ${suffix}`);
  assert.equal(edited.data.zone_id, 3);
  await request('PUT', `/posts/${post.post_id}`, {
    userId: bob.user_id,
    zone_id: 3,
    title: '越权编辑',
    content: '不应成功',
    picturePaths: []
  }, 403);

  await request('POST', '/change-password', {
    userId: bob.user_id,
    oldPassword: 'Secret123!',
    newPassword: 'Changed123456'
  });
  await request('POST', '/login', { account: bobAccount, password: 'Changed123456' });

  const resetSent = await request('POST', '/send-verify-code', {
    email: aliceAccount,
    type: 'password_reset'
  });
  await request('POST', '/reset-password', {
    email: aliceAccount,
    code: resetSent.data.testCode,
    newPassword: 'Reset123456'
  });
  await request('POST', '/login', { account: aliceAccount, password: 'Reset123456' });

  await request('POST', `/posts/${post.post_id}/interact`, { userId: bob.user_id, actionType: 'like' });
  await request('POST', `/posts/${post.post_id}/interact`, { userId: bob.user_id, actionType: 'collect' });

  const rootComment = (await request('POST', `/posts/${post.post_id}/comments`, { userId: bob.user_id, content: '测试评论' })).data.comment;
  await request('POST', `/posts/${post.post_id}/comments`, { userId: alice.user_id, parentId: rootComment.id, content: '测试回复' });
  await request('POST', `/comments/${rootComment.id}/like`, { userId: alice.user_id, like: true });
  const comments = await request('GET', `/posts/${post.post_id}/comments?userId=${alice.user_id}`);
  assert.equal(comments.data[0].replies.length, 1);

  await request('POST', '/follow', { followerId: bob.user_id, followedId: alice.user_id, action: 'follow' });
  const follows = await request('GET', `/user/follows?userId=${bob.user_id}&page=1&pageSize=10`);
  assert.ok(follows.data.some((item) => Number(item.user_id) === alice.user_id));
  const followers = await request('GET', `/user/${alice.user_id}/followers?currentUserId=${alice.user_id}`);
  assert.ok(followers.data.some((item) => Number(item.user_id) === bob.user_id));
  const following = await request('GET', `/user/${bob.user_id}/following?currentUserId=${bob.user_id}`);
  assert.ok(following.data.some((item) => Number(item.user_id) === alice.user_id));

  await request('POST', '/track-browsing', { userId: bob.user_id, postId: post.post_id });
  const history = await request('GET', `/user/${bob.user_id}/browsing-history`);
  assert.equal(Number(history.data[0].post_id), post.post_id);

  const collected = await request('GET', `/user/${bob.user_id}/collected-posts`);
  assert.ok(collected.data.some((item) => item.post_id === post.post_id));
  const mine = await request('GET', `/user/${alice.user_id}/myposts?currentUserId=${bob.user_id}`);
  assert.ok(mine.data.some((item) => item.post_id === post.post_id));
  const search = await request('GET', `/search/posts?keyword=${encodeURIComponent('已编辑帖子')}&userId=${bob.user_id}`);
  assert.ok(search.data.some((item) => item.post_id === post.post_id));
  const popular = await request('GET', `/popular-posts?minLikes=1&userId=${bob.user_id}`);
  assert.ok(popular.data.some((item) => item.post_id === post.post_id));

  await request('POST', '/send-message', { sender_id: bob.user_id, receiver_id: alice.user_id, content: '测试私信' });
  await request('POST', '/send-message', { sender_id: bob.user_id, receiver_id: alice.user_id, content: '第二条私信' });
  await request('POST', '/send-message', { sender_id: bob.user_id, receiver_id: alice.user_id, content: '第三条私信' });
  const conversations = await request('GET', `/conversations/${alice.user_id}`);
  const conversation = conversations.data.find((item) => Number(item.partner_id) === bob.user_id);
  assert.ok(conversation);
  assert.equal(Number(conversation.unread_count), 3);
  const messages = await request('GET', `/messages/${alice.user_id}/${bob.user_id}?pageSize=2`);
  assert.equal(messages.data.at(-1).message_content, '第三条私信');
  assert.equal(messages.hasMore, true);
  const olderMessages = await request('GET', `/messages/${alice.user_id}/${bob.user_id}?pageSize=2&beforeId=${messages.data[0].message_id}`);
  assert.ok(olderMessages.data.length >= 1);
  await request('POST', '/send-message', { sender_id: bob.user_id, receiver_id: alice.user_id, content: '轮询新消息' });
  const polledMessages = await request('GET', `/messages/${alice.user_id}/${bob.user_id}?afterId=${messages.data.at(-1).message_id}`);
  assert.equal(polledMessages.data.at(-1).message_content, '轮询新消息');
  const activities = await request('GET', `/user-activity/${alice.user_id}?page=1&pageSize=2`);
  assert.equal(activities.data.length, 2);
  assert.ok(activities.unreadTotal >= 1);
  await request('POST', `/user-activity/${alice.user_id}/read`, { activityId: activities.data[0].id });
  await request('POST', `/user-activity/${alice.user_id}/read`, {});
  const readActivities = await request('GET', `/user-activity/${alice.user_id}?page=1&pageSize=2`);
  assert.equal(readActivities.unreadTotal, 0);

  const schoolEmail = `student${suffix}@mail.uic.edu.cn`;
  const sent = await request('POST', '/send-verify-code', { email: schoolEmail, userId: alice.user_id, type: 'school_verification' });
  assert.match(sent.data.testCode, /^\d{6}$/);
  await request('POST', '/verify-email-code', { email: schoolEmail, code: sent.data.testCode, userId: alice.user_id, type: 'school_verification' });
  const status = await request('GET', `/user/${alice.user_id}/verification-status`);
  assert.equal(status.data.school_email_verified, true);

  await request('POST', `/posts/${post.post_id}/report`, { userId: bob.user_id, reason: '自动化测试' });
  await request('GET', `/admin/reports?adminUserId=${bob.user_id}`, undefined, 403);
  const reports = await request('GET', `/admin/reports?adminUserId=${alice.user_id}&status=pending`);
  const report = reports.data.find(item => Number(item.post_id) === post.post_id);
  assert.ok(report);
  await request('PATCH', `/admin/reports/${report.id}`, {
    adminUserId: alice.user_id,
    status: 'reviewed',
    postAction: 'hide'
  });
  await request('GET', `/post/${post.post_id}`, undefined, 404);
  await request('PATCH', `/admin/reports/${report.id}`, {
    adminUserId: alice.user_id,
    status: 'reviewed',
    postAction: 'restore'
  });

  const submittedFeedback = await request('POST', '/feedback', {
    userId: bob.user_id,
    category: 'feature',
    content: '自动化测试反馈',
    contact: bobAccount
  });
  const feedbackItems = await request('GET', `/admin/feedback?adminUserId=${alice.user_id}&status=pending`);
  assert.ok(feedbackItems.data.some(item => Number(item.id) === submittedFeedback.data.feedbackId));
  await request('PATCH', `/admin/feedback/${submittedFeedback.data.feedbackId}`, {
    adminUserId: alice.user_id,
    status: 'resolved'
  });
  await request('DELETE', `/comments/${rootComment.id}`, { userId: bob.user_id });
  await request('DELETE', `/user/${bob.user_id}/browsing-history`);
  await request('DELETE', `/posts/${post.post_id}`, { userId: alice.user_id });
  await setUserRole(alice.user_id, 'user');

  console.log('Smoke test passed: all frontend API groups are operational.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
