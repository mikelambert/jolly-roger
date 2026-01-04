# Intermittent Puzzlers - Jolly Roger Deployment

This document describes the complete AWS deployment of Jolly Roger for the Intermittent Puzzlers team.

## Quick Reference

| Resource | Value |
|----------|-------|
| **Site URL** | https://intermittentpuzzlers.jall.org |
| **AWS Account** | 604006981405 |
| **AWS Region** | us-east-1 |
| **CloudFormation Stack** | jolly-roger |
| **Serving Mode** | SingleInstance (can switch to NLB) |
| **Admin Email** | intermittentpuzzlers@jall.org |

---

## Architecture Overview

```
                    ┌─────────────────────────────────────┐
                    │         Route53 DNS                 │
                    │  intermittentpuzzlers.jall.org      │
                    │  Zone ID: Z06458421VAHMLLS16AQP     │
                    └─────────────────┬───────────────────┘
                                      │
                                      ▼
                    ┌─────────────────────────────────────┐
                    │      EC2 Instance (t3a.micro)       │
                    │      Elastic IP: 54.235.74.215      │
                    │                                     │
                    │  ┌─────────────────────────────┐    │
                    │  │  HAProxy (port 443)         │    │
                    │  │  - TLS termination          │    │
                    │  │  - Let's Encrypt cert       │    │
                    │  └─────────────┬───────────────┘    │
                    │                │                    │
                    │  ┌─────────────▼───────────────┐    │
                    │  │  Nginx (ports 8443/8444)    │    │
                    │  │  - HTTP/1 and HTTP/2        │    │
                    │  └─────────────┬───────────────┘    │
                    │                │                    │
                    │  ┌─────────────▼───────────────┐    │
                    │  │  Jolly Roger (port 3000)    │    │
                    │  │  - Meteor application       │    │
                    │  └─────────────────────────────┘    │
                    │                                     │
                    │  ┌─────────────────────────────┐    │
                    │  │  Coturn (TURN server)       │    │
                    │  │  - Audio conferencing       │    │
                    │  └─────────────────────────────┘    │
                    │                                     │
                    │  ┌─────────────────────────────┐    │
                    │  │  Watchtower                 │    │
                    │  │  - Auto-updates containers  │    │
                    │  └─────────────────────────────┘    │
                    └─────────────────────────────────────┘
                                      │
                    ┌─────────────────┴─────────────────┐
                    │                                   │
                    ▼                                   ▼
        ┌───────────────────────┐         ┌───────────────────────┐
        │   MongoDB Atlas       │         │   AWS SES             │
        │   (Free Tier M0)      │         │   (Email sending)     │
        └───────────────────────┘         └───────────────────────┘
```

---

## AWS Resources

### IAM

| Resource | Value |
|----------|-------|
| Admin User | jollyroger-admin |
| App Instance Role | arn:aws:iam::604006981405:role/JollyRogerAppInstanceRole |
| SES SMTP User | ses-smtp-user |

The `JollyRogerAppInstanceRole` is used by EC2 instances and for MongoDB Atlas IAM authentication.

### Route53

| Resource | Value |
|----------|-------|
| Hosted Zone | intermittentpuzzlers.jall.org |
| Zone ID | Z06458421VAHMLLS16AQP |

**DNS Delegation:** The parent domain (jall.org) must have NS records pointing to:
- ns-558.awsdns-05.net
- ns-1633.awsdns-12.co.uk
- ns-1082.awsdns-07.org
- ns-40.awsdns-05.com

### ACM Certificate

| Resource | Value |
|----------|-------|
| Certificate ARN | arn:aws:acm:us-east-1:604006981405:certificate/1f26eb12-68d2-44e6-a6b1-d02f15483ae9 |
| Domain | intermittentpuzzlers.jall.org |
| Status | Issued |

**Note:** This certificate is used in NLB mode. In SingleInstance mode, Let's Encrypt certificates are used instead (auto-renewed via certbot).

### S3

An S3 bucket is created by CloudFormation for image uploads. The bucket name is auto-generated.

### SSM Parameter Store

| Parameter | Purpose |
|-----------|---------|
| mailgun | SMTP URL for email sending |

---

## External Services

### MongoDB Atlas

| Setting | Value |
|---------|-------|
| Cluster | intermittent-puzzlers |
| Host | intermittent-puzzlers.u58lkkj.mongodb.net |
| Database | jollyroger |
| Authentication | AWS IAM |
| IAM Role ARN | arn:aws:iam::604006981405:role/JollyRogerAppInstanceRole |

**Connection URLs:**
```
MONGO_URL=mongodb+srv://intermittent-puzzlers.u58lkkj.mongodb.net/jollyroger?authSource=%24external&authMechanism=MONGODB-AWS&appName=intermittent-puzzlers

MONGO_OPLOG_URL=mongodb+srv://intermittent-puzzlers.u58lkkj.mongodb.net/local?authSource=%24external&authMechanism=MONGODB-AWS&appName=intermittent-puzzlers
```

**MongoDB Atlas Configuration Required:**
1. **Database Access:** Create user with AWS IAM authentication
   - IAM Type: IAM Role
   - ARN: `arn:aws:iam::604006981405:role/JollyRogerAppInstanceRole`
   - Role: Atlas admin
2. **Network Access:** Allow `0.0.0.0/0` (required because EC2 IPs aren't static)

### AWS SES (Email)

| Setting | Value |
|---------|-------|
| Region | us-east-1 |
| SMTP Host | email-smtp.us-east-1.amazonaws.com |
| SMTP Port | 587 |
| SMTP Username | AKIAYZIM7D4OQXR3NXEN |
| Verified Domain | intermittentpuzzlers.jall.org |

**Important:** New AWS accounts have SES in sandbox mode. To send emails to unverified addresses, request production access in the AWS SES console.

**DNS Records for SES (already configured in Route53):**
- TXT record for domain verification
- 3 CNAME records for DKIM

### Google Cloud (for Sheets integration)

Jolly Roger requires a Google Cloud project for creating collaborative spreadsheets.

**Required APIs (must be enabled):**
- Google Drive API
- Google Sheets API
- Google Docs API (optional, for document support)

**Configuration in Jolly Roger Admin:**
1. **OAuth Client:** Client ID and Secret from Google Cloud Console
2. **Service User:** A linked Google account that owns all spreadsheets

---

## CloudFormation Stack

### Current Configuration

```bash
aws cloudformation describe-stacks --stack-name jolly-roger --region us-east-1
```

### Key Parameters

| Parameter | Current Value |
|-----------|---------------|
| ServingMode | SingleInstance |
| AppUrl | intermittentpuzzlers.jall.org |
| AppDomain | Z06458421VAHMLLS16AQP |
| AppInstanceType | t3a.micro |
| AppMinSize | 1 |
| AppMaxSize | 2 |
| CloudWatchMode | Detailed |

### TURN Secret

The TURN secret for audio conferencing: `rmQH1uaB2aWGWoIcyxKiVlVbC6E9MZxq`

---

## Code Deployment

### Current Setup

We run a **fork** of Jolly Roger to enable custom modifications. The deployment uses:

| Resource | Value |
|----------|-------|
| **Fork Repository** | https://github.com/mikelambert/jolly-roger |
| **Upstream Repository** | https://github.com/deathandmayhem/jolly-roger |
| **Docker Image** | `ghcr.io/mikelambert/jolly-roger:latest` |
| **Local Remote (fork)** | `git@github.com:mikelambert/jolly-roger.git` |
| **Local Remote (origin)** | `https://github.com/deathandmayhem/jolly-roger.git` |

### How Deployment Works

1. **Push code** to the fork's `main` branch
2. **GitHub Actions** automatically builds Docker images for amd64 and arm64
3. **Images pushed** to `ghcr.io/mikelambert/jolly-roger:latest`
4. **Watchtower** on EC2 auto-pulls new images every 30 seconds (or update CloudFormation to force immediate deploy)

### Deploying Changes

```bash
# Make your code changes, then:
git add .
git commit -m "Your change description"
git push fork main
```

Then either:
- **Wait for Watchtower** (~30 seconds after GitHub Actions completes, typically 5-10 min total)
- **Force immediate deploy** via CloudFormation update (triggers rolling EC2 replacement)

### Forcing Immediate Deployment

To force an immediate deployment instead of waiting for Watchtower:

```bash
aws cloudformation update-stack \
  --stack-name jolly-roger \
  --use-previous-template \
  --parameters \
    ParameterKey=DockerPackage,ParameterValue=ghcr.io/mikelambert/jolly-roger:latest \
    ParameterKey=ServingMode,UsePreviousValue=true \
    ParameterKey=MongoUrl,UsePreviousValue=true \
    ParameterKey=MongoOplogUrl,UsePreviousValue=true \
    ParameterKey=AppUrl,UsePreviousValue=true \
    ParameterKey=AppName,UsePreviousValue=true \
    ParameterKey=AppDomain,UsePreviousValue=true \
    ParameterKey=AppInstanceType,UsePreviousValue=true \
    ParameterKey=AppMinSize,UsePreviousValue=true \
    ParameterKey=AppMaxSize,UsePreviousValue=true \
    ParameterKey=AppDesiredCapacity,UsePreviousValue=true \
    ParameterKey=CertificateArn,UsePreviousValue=true \
    ParameterKey=CloudWatchMode,UsePreviousValue=true \
    ParameterKey=SshUsers,UsePreviousValue=true \
    ParameterKey=PapertrailHost,UsePreviousValue=true \
    ParameterKey=TurnSecret,UsePreviousValue=true \
    ParameterKey=CertNotificationEmail,UsePreviousValue=true \
  --capabilities CAPABILITY_NAMED_IAM \
  --region us-east-1
```

### Syncing with Upstream

To pull in updates from the upstream Death and Mayhem repository:

```bash
# Fetch upstream changes
git fetch origin main

# Merge upstream into your local main
git merge origin/main

# Push to your fork
git push fork main
```

### Git Remote Setup

If you need to set up the remotes again:

```bash
# Origin points to upstream (for pulling updates)
git remote set-url origin https://github.com/deathandmayhem/jolly-roger.git

# Fork points to your fork (for pushing deployments)
git remote add fork git@github.com:mikelambert/jolly-roger.git
```

### Checking GitHub Actions Build Status

Visit: https://github.com/mikelambert/jolly-roger/actions

The "Build and test Docker image" workflow runs on every push to main and:
1. Runs linters and tests
2. Builds Docker images for linux/amd64 and linux/arm64
3. Pushes to GitHub Container Registry

### Terminate and Replace Instance (Alternative)

To force a fresh instance instead of updating:

```bash
INSTANCE_ID=$(aws ec2 describe-instances --region us-east-1 \
  --filters "Name=tag:aws:cloudformation:stack-name,Values=jolly-roger" "Name=instance-state-name,Values=running" \
  --query 'Reservations[].Instances[].InstanceId' --output text)

aws ec2 terminate-instances --instance-ids $INSTANCE_ID --region us-east-1
```

### Adding SSH Access

To enable SSH access for debugging/manual deployments, update the stack with SSH users:

```bash
aws cloudformation update-stack \
  --stack-name jolly-roger \
  --use-previous-template \
  --parameters \
    ParameterKey=SshUsers,ParameterValue='yourusername=gh:your-github-username' \
    ParameterKey=ServingMode,UsePreviousValue=true \
    ParameterKey=CertificateArn,UsePreviousValue=true \
    ParameterKey=AppUrl,UsePreviousValue=true \
    ParameterKey=AppDomain,UsePreviousValue=true \
    ParameterKey=AppName,UsePreviousValue=true \
    ParameterKey=TurnSecret,UsePreviousValue=true \
    ParameterKey=MongoUrl,UsePreviousValue=true \
    ParameterKey=MongoOplogUrl,UsePreviousValue=true \
  --capabilities CAPABILITY_NAMED_IAM \
  --region us-east-1
```

The format is `username=gh:github-username` - it imports SSH keys from GitHub.

Then SSH with: `ssh yourusername@intermittentpuzzlers.jall.org`

---

## Serving Modes

### SingleInstance Mode (Current)

- **Cost:** ~$12-15/month
- **SSL:** Let's Encrypt (auto-renewed)
- **Scaling:** Single EC2 instance
- **DNS:** Points directly to Elastic IP

**Pros:**
- Lower cost (no NLB charges)
- Simpler architecture

**Cons:**
- No load balancing
- Brief downtime during deployments

### NLB Mode

- **Cost:** ~$30-40/month
- **SSL:** AWS ACM certificate
- **Scaling:** Auto-scaling group (1-2 instances)
- **DNS:** Points to Network Load Balancer

**Pros:**
- Zero-downtime deployments
- Can scale to multiple instances
- AWS-managed SSL certificates

**Cons:**
- Higher cost (~$18/month for NLB alone)

---

## Switching Serving Modes

### Switch to NLB Mode

```bash
aws cloudformation update-stack \
  --stack-name jolly-roger \
  --use-previous-template \
  --parameters \
    ParameterKey=ServingMode,ParameterValue=NLB \
    ParameterKey=CertificateArn,UsePreviousValue=true \
    ParameterKey=AppUrl,UsePreviousValue=true \
    ParameterKey=AppDomain,UsePreviousValue=true \
    ParameterKey=AppName,UsePreviousValue=true \
    ParameterKey=TurnSecret,UsePreviousValue=true \
    ParameterKey=MongoUrl,UsePreviousValue=true \
    ParameterKey=MongoOplogUrl,UsePreviousValue=true \
    ParameterKey=SshUsers,UsePreviousValue=true \
  --capabilities CAPABILITY_NAMED_IAM \
  --region us-east-1
```

### Switch to SingleInstance Mode

```bash
aws cloudformation update-stack \
  --stack-name jolly-roger \
  --use-previous-template \
  --parameters \
    ParameterKey=ServingMode,ParameterValue=SingleInstance \
    ParameterKey=CertificateArn,UsePreviousValue=true \
    ParameterKey=AppUrl,UsePreviousValue=true \
    ParameterKey=AppDomain,UsePreviousValue=true \
    ParameterKey=AppName,UsePreviousValue=true \
    ParameterKey=TurnSecret,UsePreviousValue=true \
    ParameterKey=MongoUrl,UsePreviousValue=true \
    ParameterKey=MongoOplogUrl,UsePreviousValue=true \
    ParameterKey=SshUsers,UsePreviousValue=true \
  --capabilities CAPABILITY_NAMED_IAM \
  --region us-east-1
```

### Shut Down (Cost Savings)

To stop all serving (keeps S3 bucket and other persistent resources):

```bash
aws cloudformation update-stack \
  --stack-name jolly-roger \
  --use-previous-template \
  --parameters \
    ParameterKey=ServingMode,ParameterValue=None \
    ParameterKey=CertificateArn,UsePreviousValue=true \
    ParameterKey=AppUrl,UsePreviousValue=true \
    ParameterKey=AppDomain,UsePreviousValue=true \
    ParameterKey=AppName,UsePreviousValue=true \
    ParameterKey=TurnSecret,UsePreviousValue=true \
    ParameterKey=MongoUrl,UsePreviousValue=true \
    ParameterKey=MongoOplogUrl,UsePreviousValue=true \
    ParameterKey=SshUsers,UsePreviousValue=true \
  --capabilities CAPABILITY_NAMED_IAM \
  --region us-east-1
```

---

## Monitoring & Debugging

### Check Stack Status

```bash
aws cloudformation describe-stacks --stack-name jolly-roger --region us-east-1 --query 'Stacks[0].StackStatus'
```

### Check EC2 Instance

```bash
aws ec2 describe-instances --region us-east-1 \
  --filters "Name=tag:aws:cloudformation:stack-name,Values=jolly-roger" \
  --query 'Reservations[].Instances[].[InstanceId,State.Name,PublicIpAddress]' \
  --output table
```

### View EC2 Console Logs

```bash
aws ec2 get-console-output --instance-id <INSTANCE_ID> --region us-east-1 --latest --output text | tail -100
```

### Check Load Balancer Health (NLB mode only)

```bash
# Get target group ARN
aws elbv2 describe-target-groups --region us-east-1 --output json | grep -A2 jolly

# Check target health
aws elbv2 describe-target-health --target-group-arn <TARGET_GROUP_ARN> --region us-east-1
```

### Test Site Health

```bash
curl -s -o /dev/null -w "%{http_code}" https://intermittentpuzzlers.jall.org/healthcheck
```

---

## Estimated Monthly Costs

### SingleInstance Mode (Current)

| Service | Cost |
|---------|------|
| EC2 (t3a.micro) | ~$7-8 |
| Elastic IP | Free (when attached) |
| Route53 | ~$0.50 |
| CloudWatch | ~$3-5 |
| S3 + Data Transfer | ~$1-2 |
| **Total** | **~$12-15** |

### NLB Mode

| Service | Cost |
|---------|------|
| EC2 (t3a.micro) | ~$7-8 |
| Network Load Balancer | ~$18-22 |
| Route53 | ~$0.50 |
| CloudWatch | ~$3-5 |
| S3 + Data Transfer | ~$1-5 |
| **Total** | **~$30-40** |

### External Services

| Service | Cost |
|---------|------|
| MongoDB Atlas (M0) | Free |
| AWS SES | ~$0 (low volume) |
| Google Cloud | Free |

---

## Initial Setup Checklist

When setting up a new Jolly Roger instance, follow these steps:

### 1. AWS Account Setup
- [ ] Create AWS account
- [ ] Create IAM admin user with programmatic access
- [ ] Configure AWS CLI: `aws configure`

### 2. MongoDB Atlas
- [ ] Create MongoDB Atlas account
- [ ] Create free M0 cluster in us-east-1
- [ ] Create database user with AWS IAM authentication
- [ ] Set IAM Role ARN to `arn:aws:iam::<ACCOUNT_ID>:role/JollyRogerAppInstanceRole`
- [ ] Add network access for 0.0.0.0/0

### 3. Domain & DNS
- [ ] Create Route53 hosted zone for subdomain
- [ ] Add NS records at parent domain registrar
- [ ] Wait for DNS propagation

### 4. SSL Certificate
- [ ] Request ACM certificate for domain
- [ ] Add CNAME validation record to Route53
- [ ] Wait for certificate to be issued

### 5. Email (SES)
- [ ] Verify domain in SES
- [ ] Add TXT and DKIM records to Route53
- [ ] Create IAM user for SMTP
- [ ] Store SMTP URL in SSM Parameter Store

### 6. Deploy CloudFormation
- [ ] Run `aws cloudformation create-stack` with all parameters
- [ ] Wait for stack creation (10-20 minutes)
- [ ] Verify site is accessible

### 7. Jolly Roger Admin Setup
- [ ] Visit site and create admin account
- [ ] Configure Google OAuth client
- [ ] Link Google service user account
- [ ] Enable Google Drive/Sheets APIs in Google Cloud Console

---

## Troubleshooting

### "Attempting to load collaborative document..." stuck

**Cause:** Google integration not fully configured.

**Fix:**
1. Verify Google Drive API and Google Sheets API are enabled in Google Cloud Console
2. Ensure OAuth client is configured in Jolly Roger admin
3. Ensure a Google service user account is linked

### 502 Bad Gateway

**Cause:** The Jolly Roger application container isn't responding.

**Possible fixes:**
1. Wait for container to fully start (can take 5-10 minutes on fresh deploy)
2. Check MongoDB Atlas network access (must allow 0.0.0.0/0)
3. Verify MongoDB Atlas IAM user is configured correctly

### Let's Encrypt certificate fails (SingleInstance mode)

**Cause:** DNS not fully propagated.

**Fix:** Wait for DNS propagation and retry the CloudFormation update.

### Stack update rollback

**Cause:** EC2 instance failed to signal success within timeout.

**Fix:** Check EC2 console logs for errors, fix the issue, and retry.

---

## Repository Information

- **Fork (for deployments):** https://github.com/mikelambert/jolly-roger
- **Upstream:** https://github.com/deathandmayhem/jolly-roger
- **CloudFormation Template:** `cloudformation/jolly-roger.yaml`
- **Documentation:** `DEVELOPMENT.md`, `docs/google-drive.md`

---

## Deployment History

| Date | Change |
|------|--------|
| 2025-12-30 | Initial deployment with NLB mode |
| 2025-12-30 | Switched to SingleInstance mode for cost savings |
| 2025-12-30 | Fixed Google Sheets integration (enabled APIs) |
| 2026-01-03 | Added document link to desktop view |
| 2026-01-03 | Auto-grant operator role on hunt join |
| 2026-01-03 | Switched to fork-based deployment (mikelambert/jolly-roger) |

---

*Last updated: 2026-01-03*
