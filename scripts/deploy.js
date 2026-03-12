const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const [deployer] = await ethers.getSigners();

  console.log("=================================================");
  console.log("Deploying Voting contract...");
  console.log("Deployer address:", deployer.address);
  console.log(
    "Account balance:",
    ethers.formatEther(await ethers.provider.getBalance(deployer.address)),
    "ETH"
  );
  console.log("=================================================");

  const Voting = await ethers.getContractFactory("Voting");
  const voting = await Voting.deploy();
  await voting.waitForDeployment();

  const contractAddress = await voting.getAddress();
  console.log("✅ Voting contract deployed to:", contractAddress);

  // Save deployment info for frontend and backend
  const deploymentInfo = {
    contractAddress,
    deployer: deployer.address,
    network: (await ethers.provider.getNetwork()).name,
    timestamp: new Date().toISOString(),
  };

  const deploymentPath = path.join(__dirname, "../deployment.json");
  fs.writeFileSync(deploymentPath, JSON.stringify(deploymentInfo, null, 2));
  console.log("📄 Deployment info saved to deployment.json");

  // Copy ABI to backend and frontend
  const artifactPath = path.join(
    __dirname,
    "../artifacts/contracts/Voting.sol/Voting.json"
  );

  if (fs.existsSync(artifactPath)) {
    const artifact = JSON.parse(fs.readFileSync(artifactPath));
    const abiData = JSON.stringify(
      { abi: artifact.abi, address: contractAddress },
      null,
      2
    );

    // Write to backend
    const backendAbiPath = path.join(__dirname, "../backend/contractABI.json");
    fs.mkdirSync(path.dirname(backendAbiPath), { recursive: true });
    fs.writeFileSync(backendAbiPath, abiData);
    console.log("📦 ABI copied to backend");

    // Write to frontend
    const frontendAbiPath = path.join(__dirname, "../frontend/src/contractABI.json");
    fs.mkdirSync(path.dirname(frontendAbiPath), { recursive: true });
    fs.writeFileSync(frontendAbiPath, abiData);
    console.log("📦 ABI copied to frontend");
  }

  console.log("=================================================");
  console.log("Deployment complete!");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
