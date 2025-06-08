
let web3;
let contract;
let accounts = [];
let tokenContract;
let selectedTierDays = 180;

function notify(message, type = "info") {
  const el = document.getElementById("notification");
  el.innerText = message;
  el.style.display = "block";
  el.style.backgroundColor = type === "error" ? "#ffdddd" : (type === "success" ? "#ddffdd" : "#ddeeff");
  el.style.color = type === "error" ? "#990000" : "#004400";
  setTimeout(() => el.style.display = "none", 5000);
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
      {
        "constant": false,
        "inputs": [
          { "name": "spender", "type": "address" },
          { "name": "amount", "type": "uint256" }
        ],
        "name": "approve",
        "outputs": [{ "name": "", "type": "bool" }],
        "type": "function"
      },
      {
        "constant": true,
        "inputs": [
          { "name": "owner", "type": "address" },
          { "name": "spender", "type": "address" }
        ],
        "name": "allowance",
        "outputs": [{ "name": "", "type": "uint256" }],
        "type": "function"
      },
      {
        "constant": true,
        "inputs": [{ "name": "owner", "type": "address" }],
        "name": "balanceOf",
        "outputs": [{ "name": "", "type": "uint256" }],
        "type": "function"
      }
    ], tokenAddress);

    document.getElementById("app").innerHTML = `
      <div id="notification"></div>
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
      <canvas id="tvlChart" width="400" height="200"></canvas>
    `;
    refreshDashboard();
  } else {
    alert("Please install MetaMask.");
  }
});

function selectTier(days) {
  const confirmTier = confirm(`คุณต้องการเลือก Tier ${days} วันใช่หรือไม่?`);
  if (confirmTier) {
    selectedTierDays = days;
    notify(`✅ เลือก Tier ${days} วันแล้ว`, "success");
  } else {
    notify("⛔ ยกเลิกการเลือก Tier", "error");
  }
}

async function stake() {
  const amount = document.getElementById("amount").value;
  if (!amount || parseFloat(amount) <= 0) {
    notify("❌ กรุณาใส่จำนวนเหรียญที่ต้องการ Stake", "error");
    return;
  }

  try {
    const tokenBalance = await tokenContract.methods.balanceOf(accounts[0]).call();
    const amountWei = web3.utils.toWei(amount, "ether");

    if (BigInt(amountWei) > BigInt(tokenBalance)) {
      notify("❌ คุณมีเหรียญไม่พอสำหรับ Stake", "error");
      return;
    }

    const allowance = await tokenContract.methods.allowance(accounts[0], contract.options.address).call();
    if (BigInt(allowance) < BigInt(amountWei)) {
      notify("🟡 Approving unlimited token allowance...", "info");
      await tokenContract.methods.approve(
        contract.options.address,
        "115792089237316195423570985008687907853269984665640564039457584007913129639935"
      ).send({ from: accounts[0] });
      notify("🟢 Token Approved", "success");
    }

    notify("⏳ Sending Stake Transaction...", "info");
    await contract.methods.stake(amountWei).send({ from: accounts[0] });
    notify("✅ Stake Success!", "success");
    refreshDashboard();

  } catch (error) {
    console.error("❌ Stake failed:", error);
    notify("❌ Stake failed: " + (error.message || "Unknown error"), "error");
  }
}

async function claim() {
  try {
    await contract.methods.claimReward().send({ from: accounts[0] });
    notify("🎉 Reward claimed successfully!", "success");
    refreshDashboard();
  } catch (error) {
    notify("❌ Claim failed: " + error.message, "error");
  }
}

async function withdraw() {
  try {
    await contract.methods.withdraw().send({ from: accounts[0] });
    notify("✅ Withdraw successful!", "success");
    refreshDashboard();
  } catch (error) {
    notify("❌ Withdraw failed: " + error.message, "error");
  }
}

async function refreshDashboard() {
  const stakeInfo = await contract.methods.stakes(accounts[0]).call();
  const reward = await contract.methods.calculateReward(accounts[0]).call();
  const rewardPerSec = await contract.methods.rewardRatePerSecond().call();

  const unlockTime = parseInt(stakeInfo.startTime) + (selectedTierDays * 86400);
  const timeNow = Math.floor(Date.now() / 1000);
  const secondsLeft = unlockTime - timeNow;
  const countdown = secondsLeft > 0 ? secondsLeft + " sec" : "Unlocked";

  const apy = ((parseFloat(web3.utils.fromWei(rewardPerSec)) * 86400 * 365) / parseFloat(web3.utils.fromWei(stakeInfo.amount) || 1)) * 100;

  document.getElementById("dashboard").innerHTML = `
    <p><strong>Staked:</strong> ${web3.utils.fromWei(stakeInfo.amount)} LYDIA</p>
    <p><strong>Reward:</strong> ${web3.utils.fromWei(reward)} LYDIA</p>
    <p><strong>Reward/sec:</strong> ${web3.utils.fromWei(rewardPerSec)} LYDIA</p>
    <p><strong>APY (est):</strong> ${apy.toFixed(2)}%</p>
    <p><strong>Unlocks in:</strong> ${countdown}</p>
  `;

  drawTVLChart();
}

function drawTVLChart() {
  const ctx = document.getElementById('tvlChart').getContext('2d');
  new Chart(ctx, {
    type: 'line',
    data: {
      labels: ['Day 1', 'Day 2', 'Day 3', 'Day 4', 'Day 5'],
      datasets: [{
        label: 'TVL (Mock)',
        data: [1200, 1350, 1400, 1600, 2000],
        borderWidth: 2
      }]
    },
    options: {
      responsive: true,
      scales: {
        y: { beginAtZero: true }
      }
    }
  });
}
