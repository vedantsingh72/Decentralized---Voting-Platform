const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("Voting Contract", function () {
  let voting;
  let owner, director, voter1, voter2;

  // Helper to create future timestamps
  const futureTime = async (secondsFromNow) => {
    const latest = await time.latest();
    return latest + secondsFromNow;
  };

  beforeEach(async () => {
    [owner, director, voter1, voter2] = await ethers.getSigners();
    const Voting = await ethers.getContractFactory("Voting");
    voting = await Voting.deploy();
    await voting.waitForDeployment();
  });

  // ── Deployment ────────────────────────────────────────────────────────────
  describe("Deployment", () => {
    it("should set the deployer as owner", async () => {
      expect(await voting.owner()).to.equal(owner.address);
    });

    it("should start with pollCount = 0", async () => {
      expect(await voting.pollCount()).to.equal(0);
    });
  });

  // ── Poll Creation ─────────────────────────────────────────────────────────
  describe("createPoll", () => {
    it("should create a poll and increment pollCount", async () => {
      const start = await futureTime(60);
      const end = await futureTime(3600);

      await voting
        .connect(director)
        .createPoll(
          "Best Framework?",
          "Vote for your preferred JS framework",
          start,
          end,
          ["React", "Vue", "Angular"],
          ["", "", ""]
        );

      expect(await voting.pollCount()).to.equal(1);
    });

    it("should emit PollCreated event", async () => {
      const start = await futureTime(60);
      const end = await futureTime(3600);

      await expect(
        voting
          .connect(director)
          .createPoll("Test Poll", "Description", start, end, ["A", "B"], ["", ""])
      )
        .to.emit(voting, "PollCreated")
        .withArgs(1, "Test Poll", director.address, start, end);
    });

    it("should revert if fewer than 2 candidates", async () => {
      const start = await futureTime(60);
      const end = await futureTime(3600);

      await expect(
        voting
          .connect(director)
          .createPoll("Bad Poll", "Desc", start, end, ["OnlyOne"], [""])
      ).to.be.revertedWith("Voting: need at least 2 candidates");
    });

    it("should revert if endTime <= startTime", async () => {
      const start = await futureTime(100);
      const end = await futureTime(50);

      await expect(
        voting
          .connect(director)
          .createPoll("Bad Times", "Desc", start, end, ["A", "B"], ["", ""])
      ).to.be.revertedWith("Voting: invalid time range");
    });
  });

  // ── Voting ────────────────────────────────────────────────────────────────
  describe("vote", () => {
    let pollId;

    beforeEach(async () => {
      const start = await futureTime(10);
      const end = await futureTime(3600);

      const tx = await voting
        .connect(director)
        .createPoll("Language Poll", "Best lang?", start, end, ["Python", "JS"], ["", ""]);
      const receipt = await tx.wait();
      pollId = 1;

      // Fast-forward to when poll is active
      await time.increase(20);
    });

    it("should allow a voter to cast a vote", async () => {
      await voting.connect(voter1).vote(pollId, 1);
      expect(await voting.hasVoted(pollId, voter1.address)).to.be.true;
    });

    it("should emit VoteCast event", async () => {
      await expect(voting.connect(voter1).vote(pollId, 1))
        .to.emit(voting, "VoteCast")
        .withArgs(pollId, 1, voter1.address);
    });

    it("should revert if voter votes twice", async () => {
      await voting.connect(voter1).vote(pollId, 1);
      await expect(voting.connect(voter1).vote(pollId, 2)).to.be.revertedWith(
        "Voting: already voted in this poll"
      );
    });

    it("should revert with invalid candidateId", async () => {
      await expect(voting.connect(voter1).vote(pollId, 99)).to.be.revertedWith(
        "Voting: invalid candidate"
      );
    });

    it("should correctly tally votes", async () => {
      await voting.connect(voter1).vote(pollId, 1);
      await voting.connect(voter2).vote(pollId, 1);

      const candidates = await voting.getCandidates(pollId);
      expect(candidates[0].voteCount).to.equal(2);
      expect(candidates[1].voteCount).to.equal(0);
    });
  });

  // ── Poll Deletion ─────────────────────────────────────────────────────────
  describe("deletePoll", () => {
    beforeEach(async () => {
      const start = await futureTime(60);
      const end = await futureTime(3600);
      await voting
        .connect(director)
        .createPoll("Delete Me", "Desc", start, end, ["A", "B"], ["", ""]);
    });

    it("director can delete their poll", async () => {
      await voting.connect(director).deletePoll(1);
      await expect(voting.getPoll(1)).to.be.revertedWith("Voting: poll has been deleted");
    });

    it("owner can delete any poll", async () => {
      await voting.connect(owner).deletePoll(1);
      await expect(voting.getPoll(1)).to.be.revertedWith("Voting: poll has been deleted");
    });

    it("random user cannot delete a poll", async () => {
      await expect(voting.connect(voter1).deletePoll(1)).to.be.revertedWith(
        "Voting: not authorised to delete this poll"
      );
    });
  });

  // ── Winner ────────────────────────────────────────────────────────────────
  describe("getWinner", () => {
    it("should return the correct winner after poll ends", async () => {
      const start = await futureTime(10);
      const end = await futureTime(100);

      await voting
        .connect(director)
        .createPoll("Winner Test", "Desc", start, end, ["Alice", "Bob"], ["", ""]);

      await time.increase(20); // poll is now active
      await voting.connect(voter1).vote(1, 2); // vote Bob
      await voting.connect(voter2).vote(1, 2); // vote Bob

      await time.increase(200); // poll has now ended

      const [winnerName, winnerVotes] = await voting.getWinner(1);
      expect(winnerName).to.equal("Bob");
      expect(winnerVotes).to.equal(2);
    });
  });
});
