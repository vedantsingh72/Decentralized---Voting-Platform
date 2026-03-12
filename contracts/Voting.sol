// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title Voting
 * @dev Decentralised voting smart contract for CN6035 DApp project
 * @notice Based on Daltonic/dappVote OSS project (MIT licence)
 *         Enhanced with additional functionality and explainability features
 */
contract Voting {
    // ─── State Variables ───────────────────────────────────────────────────────

    address public owner;
    uint256 public pollCount;

    struct Candidate {
        uint256 id;
        string name;
        string imageUrl;
        uint256 voteCount;
    }

    struct Poll {
        uint256 id;
        string title;
        string description;
        uint256 startTime;
        uint256 endTime;
        bool deleted;
        address director;
        uint256 totalVotes;
        Candidate[] candidates;
    }

    // ─── Mappings ──────────────────────────────────────────────────────────────

    mapping(uint256 => Poll) private polls;
    // pollId => voter address => has voted
    mapping(uint256 => mapping(address => bool)) public hasVoted;
    // pollId => voter address => candidateId voted for
    mapping(uint256 => mapping(address => uint256)) public voterChoice;

    // ─── Events ────────────────────────────────────────────────────────────────

    event PollCreated(
        uint256 indexed pollId,
        string title,
        address indexed director,
        uint256 startTime,
        uint256 endTime
    );

    event VoteCast(
        uint256 indexed pollId,
        uint256 indexed candidateId,
        address indexed voter
    );

    event PollDeleted(uint256 indexed pollId, address indexed director);

    // ─── Modifiers ─────────────────────────────────────────────────────────────

    modifier onlyOwner() {
        require(msg.sender == owner, "Voting: caller is not the owner");
        _;
    }

    modifier pollExists(uint256 _pollId) {
        require(_pollId > 0 && _pollId <= pollCount, "Voting: poll does not exist");
        require(!polls[_pollId].deleted, "Voting: poll has been deleted");
        _;
    }

    modifier pollActive(uint256 _pollId) {
        require(
            block.timestamp >= polls[_pollId].startTime &&
            block.timestamp <= polls[_pollId].endTime,
            "Voting: poll is not currently active"
        );
        _;
    }

    // ─── Constructor ───────────────────────────────────────────────────────────

    constructor() {
        owner = msg.sender;
    }

    // ─── Poll Management ───────────────────────────────────────────────────────

    /**
     * @dev Creates a new poll with given candidates
     * @param _title Poll title
     * @param _description Poll description
     * @param _startTime Unix timestamp when voting opens
     * @param _endTime Unix timestamp when voting closes
     * @param _candidateNames Array of candidate names
     * @param _candidateImages Array of candidate image URLs
     */
    function createPoll(
        string memory _title,
        string memory _description,
        uint256 _startTime,
        uint256 _endTime,
        string[] memory _candidateNames,
        string[] memory _candidateImages
    ) external returns (uint256) {
        require(bytes(_title).length > 0, "Voting: title cannot be empty");
        require(_startTime < _endTime, "Voting: invalid time range");
        require(_startTime >= block.timestamp, "Voting: start time must be in future");
        require(_candidateNames.length >= 2, "Voting: need at least 2 candidates");
        require(
            _candidateNames.length == _candidateImages.length,
            "Voting: names and images length mismatch"
        );

        pollCount++;
        uint256 newPollId = pollCount;

        Poll storage newPoll = polls[newPollId];
        newPoll.id = newPollId;
        newPoll.title = _title;
        newPoll.description = _description;
        newPoll.startTime = _startTime;
        newPoll.endTime = _endTime;
        newPoll.deleted = false;
        newPoll.director = msg.sender;
        newPoll.totalVotes = 0;

        for (uint256 i = 0; i < _candidateNames.length; i++) {
            newPoll.candidates.push(
                Candidate({
                    id: i + 1,
                    name: _candidateNames[i],
                    imageUrl: _candidateImages[i],
                    voteCount: 0
                })
            );
        }

        emit PollCreated(newPollId, _title, msg.sender, _startTime, _endTime);
        return newPollId;
    }

    /**
     * @dev Cast a vote in a specific poll
     * @param _pollId The poll to vote in
     * @param _candidateId The candidate to vote for
     */
    function vote(uint256 _pollId, uint256 _candidateId)
        external
        pollExists(_pollId)
        pollActive(_pollId)
    {
        require(!hasVoted[_pollId][msg.sender], "Voting: already voted in this poll");
        require(
            _candidateId >= 1 &&
            _candidateId <= polls[_pollId].candidates.length,
            "Voting: invalid candidate"
        );

        hasVoted[_pollId][msg.sender] = true;
        voterChoice[_pollId][msg.sender] = _candidateId;

        // candidateId is 1-indexed
        polls[_pollId].candidates[_candidateId - 1].voteCount++;
        polls[_pollId].totalVotes++;

        emit VoteCast(_pollId, _candidateId, msg.sender);
    }

    /**
     * @dev Delete a poll (only poll director or contract owner)
     */
    function deletePoll(uint256 _pollId) external pollExists(_pollId) {
        require(
            msg.sender == polls[_pollId].director || msg.sender == owner,
            "Voting: not authorised to delete this poll"
        );
        polls[_pollId].deleted = true;
        emit PollDeleted(_pollId, msg.sender);
    }

    // ─── View Functions ────────────────────────────────────────────────────────

    /**
     * @dev Returns poll metadata (without candidates array)
     */
    function getPoll(uint256 _pollId)
        external
        view
        pollExists(_pollId)
        returns (
            uint256 id,
            string memory title,
            string memory description,
            uint256 startTime,
            uint256 endTime,
            address director,
            uint256 totalVotes
        )
    {
        Poll storage p = polls[_pollId];
        return (p.id, p.title, p.description, p.startTime, p.endTime, p.director, p.totalVotes);
    }

    /**
     * @dev Returns all candidates for a given poll
     */
    function getCandidates(uint256 _pollId)
        external
        view
        pollExists(_pollId)
        returns (Candidate[] memory)
    {
        return polls[_pollId].candidates;
    }

    /**
     * @dev Returns leading candidate for a poll that has ended
     */
    function getWinner(uint256 _pollId)
        external
        view
        pollExists(_pollId)
        returns (string memory winnerName, uint256 winnerVotes)
    {
        require(block.timestamp > polls[_pollId].endTime, "Voting: poll has not ended");
        uint256 highestVotes = 0;
        uint256 winnerIndex = 0;

        Candidate[] storage candidates = polls[_pollId].candidates;
        for (uint256 i = 0; i < candidates.length; i++) {
            if (candidates[i].voteCount > highestVotes) {
                highestVotes = candidates[i].voteCount;
                winnerIndex = i;
            }
        }
        return (candidates[winnerIndex].name, candidates[winnerIndex].voteCount);
    }

    /**
     * @dev Returns all active (non-deleted, within time range) poll IDs
     */
    function getActivePolls() external view returns (uint256[] memory) {
        uint256 count = 0;
        for (uint256 i = 1; i <= pollCount; i++) {
            if (
                !polls[i].deleted &&
                block.timestamp >= polls[i].startTime &&
                block.timestamp <= polls[i].endTime
            ) {
                count++;
            }
        }

        uint256[] memory activeIds = new uint256[](count);
        uint256 idx = 0;
        for (uint256 i = 1; i <= pollCount; i++) {
            if (
                !polls[i].deleted &&
                block.timestamp >= polls[i].startTime &&
                block.timestamp <= polls[i].endTime
            ) {
                activeIds[idx++] = i;
            }
        }
        return activeIds;
    }

    /**
     * @dev Returns all poll IDs (including inactive, excluding deleted)
     */
    function getAllPolls() external view returns (uint256[] memory) {
        uint256 count = 0;
        for (uint256 i = 1; i <= pollCount; i++) {
            if (!polls[i].deleted) count++;
        }

        uint256[] memory allIds = new uint256[](count);
        uint256 idx = 0;
        for (uint256 i = 1; i <= pollCount; i++) {
            if (!polls[i].deleted) allIds[idx++] = i;
        }
        return allIds;
    }
}
