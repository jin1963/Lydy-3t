
let web3;
let contract;
let accounts = [];
let tokenContract;
let selectedTierDays = 180;

function notify(message) {
  alert(message);
}

function disconnectWallet() {
  accounts = [];
  document.getElementById("app").innerHTML = "<p>Disconnected. Reload the page to connect again.</p>";
}

window.addEventListener("load", async () => {
  if (window.ethereum) {
    web3 = new Web3(window.ethereum);
    await window.ethereum.enable();
    accounts = await web3.eth.getAccounts();
    contract = new web3.eth.Contract(contractABI, contractAddress);
    const tokenAddress = await contract.methods.token().call();
    tokenContract = new web3.eth.Contract([
      {"constant":false,"inputs":[{"name":"spender","type":"address"},{"name":"amount","type":"uint256"}],"name":"approve","outputs":[{"name":"","type":"bool"}],"type":"function"},
      {"constant":true,"inputs":[{"name":"owner","type":"address"},{"name":"spender","type":"address"}],"name":"allowance","outputs":[{"name":"","type":"uint256"}],"type":"function"},
      {"constant":true,"inputs":[{"name":"owner","type":"address"}],"name":"balanceOf","outputs":[{"name":"","type":"uint256"}],"type":"function"}
    ], tokenAddress);

    document.getElementById("app").innerHTML = `
      <p><strong>Wallet:</strong> ${accounts[0]} <button onclick="disconnectWallet()">Disconnect</button></p>
      <p><strong>Tier:</strong>
        <button onclick="selectTier(180)">180d</button>
        <button onclick="selectTier(240)">240d</button>
        <button onclick="selectTier(365)">365d</button>
      </p>
      <p><input type='number' id='amount' placeholder='Amount to stake (LYDIA)'/></p>
      <button onclick='stake()'>📥 Stake</button>
      <button onclick='claim()'>🎁 Claim</button>
      <button onclick='withdraw()'>📤 Withdraw</button>
      <div id='dashboard'></div>
    `;
    refreshDashboard();
  } else {
    alert("Please install MetaMask.");
  }
});

function selectTier(days) {
  if (confirm(`คุณต้องการเลือก Tier ${days} วันใช่หรือไม่?`)) {
    selectedTierDays = days;
    notify(`✅ เลือก Tier ${days} วันแล้ว`);
  } else {
    notify("❌ ยกเลิกการเลือก Tier");
  }
}

async function stake() {
  const amount = document.getElementById("amount").value;
  if (!amount || parseFloat(amount) <= 0) return notify("Invalid amount");
  const amountWei = web3.utils.toWei(amount, "ether");
  const balance = await tokenContract.methods.balanceOf(accounts[0]).call();
  if (BigInt(amountWei) > BigInt(balance)) return notify("Insufficient balance");

  const allowance = await tokenContract.methods.allowance(accounts[0], contract.options.address).call();
  if (BigInt(allowance) < BigInt(amountWei)) {
    await tokenContract.methods.approve(contract.options.address, "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff").send({ from: accounts[0] });
  }

  await contract.methods.stake(amountWei).send({ from: accounts[0] });
  notify("✅ Stake success");
  refreshDashboard();
}

async function claim() {
  await contract.methods.claimReward().send({ from: accounts[0] });
  notify("🎁 Claimed!");
  refreshDashboard();
}

async function withdraw() {
  await contract.methods.withdraw().send({ from: accounts[0] });
  notify("✅ Withdraw success");
  refreshDashboard();
}

async function refreshDashboard() {
  const stakeInfo = await contract.methods.stakes(accounts[0]).call();
  const reward = await contract.methods.calculateReward(accounts[0]).call();
  const rewardRate = await contract.methods.rewardRatePerSecond().call();

  const unlockTime = parseInt(stakeInfo.startTime) + selectedTierDays * 86400;
  const now = Math.floor(Date.now() / 1000);
  const countdown = unlockTime > now ? (unlockTime - now) + " sec" : "Unlocked";

  document.getElementById("dashboard").innerHTML = `
    <p><strong>Staked:</strong> ${web3.utils.fromWei(stakeInfo.amount)} LYDIA</p>
    <p><strong>Reward:</strong> ${web3.utils.fromWei(reward)} LYDIA</p>
    <p><strong>Unlock in:</strong> ${countdown}</p>
  `;
}
